import pytest
from fastapi import HTTPException

from app.models.reseller import Reseller
from app.models.user import User
from app.routers.equipment_notes import create_equipment_note, delete_equipment_note, list_equipment_notes
from app.schemas.equipment_note import EquipmentNoteCreate
from tests.test_operational_device_sync import make_db

KEY = "breaker:fdr-01"


def make_users(db, system):
    reseller_id = system.company.reseller_id
    users = {
        "superadmin": User(email="super@example.com", display_name="Super", role="superadmin"),
        "reseller_admin": User(email="reseller@example.com", display_name="Reseller", role="reseller_admin", reseller_id=reseller_id),
        "company_admin": User(email="customer@example.com", display_name="Customer", role="company_admin", company_id=system.company_id),
        "system_operator": User(email="op@example.com", display_name="Operator", role="system_operator", company_id=system.company_id, scope_type="company_wide"),
        "system_viewer": User(email="viewer@example.com", display_name="Viewer", role="system_viewer", company_id=system.company_id, scope_type="company_wide"),
    }
    db.add_all(users.values())
    db.flush()
    return users


def add(db, system, user, text="No load attached, working fine"):
    return create_equipment_note(system.id, EquipmentNoteCreate(record_key=KEY, text=text), db, user)


def test_note_from_reseller_admin_is_visible_to_every_role_with_original_author():
    db, system, _panel = make_db()
    users = make_users(db, system)
    add(db, system, users["reseller_admin"])

    for role, user in users.items():
        notes = list_equipment_notes(system.id, KEY, db, user)
        assert len(notes) == 1, role
        note = notes[0]
        assert note.author_name == "Reseller"
        assert note.author_email == "reseller@example.com"
        assert note.author_role == "reseller_admin"
        assert note.model_dump(mode="json")["created_at"].endswith("+00:00")


def test_system_viewer_can_read_but_not_add():
    db, system, _panel = make_db()
    users = make_users(db, system)
    with pytest.raises(HTTPException) as error:
        add(db, system, users["system_viewer"])
    assert error.value.status_code == 403


def test_only_author_or_superadmin_can_delete():
    db, system, _panel = make_db()
    users = make_users(db, system)
    note = add(db, system, users["reseller_admin"])

    assert list_equipment_notes(system.id, KEY, db, users["company_admin"])[0].can_delete is False
    with pytest.raises(HTTPException) as error:
        delete_equipment_note(system.id, note.id, db, users["company_admin"])
    assert error.value.status_code == 403

    assert list_equipment_notes(system.id, KEY, db, users["superadmin"])[0].can_delete is True
    delete_equipment_note(system.id, note.id, db, users["superadmin"])
    assert list_equipment_notes(system.id, KEY, db, users["reseller_admin"]) == []


def test_users_outside_the_systems_scope_cannot_see_notes():
    db, system, _panel = make_db()
    users = make_users(db, system)
    add(db, system, users["reseller_admin"])
    other = Reseller(name="Other reseller")
    db.add(other)
    db.flush()
    outsider = User(email="other@example.com", display_name="Other", role="reseller_admin", reseller_id=other.id)
    db.add(outsider)
    db.flush()
    with pytest.raises(HTTPException) as error:
        list_equipment_notes(system.id, KEY, db, outsider)
    assert error.value.status_code == 404
