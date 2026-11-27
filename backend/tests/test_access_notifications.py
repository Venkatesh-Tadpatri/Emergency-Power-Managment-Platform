import pytest

from app.models.site import Site
from app.models.system import System
from app.models.user import User
from app.routers import users as users_router
from app.schemas.user import UserAssignSystems, UserRoleAssign
from app.services.email import render_text
from tests.test_operational_device_sync import make_db


@pytest.fixture
def sent(monkeypatch):
    captured = []
    monkeypatch.setattr(users_router.notifications, "dispatch", lambda messages: captured.extend(messages))
    return captured


def setup():
    db, system, _panel = make_db()
    company = system.company
    site = db.get(Site, system.site_id)
    second = System(name="Generator Monitoring System", company_id=company.id, site_id=site.id)
    db.add(second)
    admin = User(email="super@example.com", display_name="Superadmin", role="superadmin", account_state="active")
    reseller_admin = User(email="reseller@example.com", display_name="Reseller Boss", role="reseller_admin", reseller_id=company.reseller_id, account_state="active")
    customer_admin = User(email="custadmin@example.com", display_name="Customer Boss", role="company_admin", company_id=company.id, account_state="active")
    suspended_admin = User(email="gone@example.com", display_name="Gone", role="company_admin", company_id=company.id, account_state="suspended")
    target = User(email="sansab@example.com", display_name="Sansab", role="system_viewer", company_id=company.id, scope_type="assigned", account_state="active")
    db.add_all([admin, reseller_admin, customer_admin, suspended_admin, target])
    db.flush()
    return db, company, site, system, second, admin, target


def test_new_equipment_assignment_emails_user_and_hierarchy(sent):
    db, company, site, system, _second, admin, target = setup()
    users_router.assign_systems(target.id, UserAssignSystems(system_ids=[system.id], site_ids=[]), db, admin)

    recipients = sorted(to for to, _ in sent)
    assert recipients == ["custadmin@example.com", "reseller@example.com", "sansab@example.com"]
    body = render_text(dict(sent)["sansab@example.com"])
    assert f"{system.name} ({site.name})" in body
    assert "Assigned by: Superadmin (Super Admin)" in body
    assert "Assigned on: " in body and "IST" in body
    assert "Access level: System Viewer" in body
    assert "Sansab (sansab@example.com)" in render_text(dict(sent)["custadmin@example.com"])


def test_only_newly_added_items_are_announced(sent):
    db, _company, site, system, second, admin, target = setup()
    users_router.assign_systems(target.id, UserAssignSystems(system_ids=[system.id], site_ids=[]), db, admin)
    sent.clear()

    users_router.assign_systems(target.id, UserAssignSystems(system_ids=[system.id], site_ids=[]), db, admin)
    assert sent == []  # unchanged save

    users_router.assign_systems(target.id, UserAssignSystems(system_ids=[system.id, second.id], site_ids=[site.id]), db, admin)
    body = render_text(dict(sent)["sansab@example.com"])
    assert f"Sites (all systems): {site.name}" in body
    # Only the newly added system is listed — not the one the user already had.
    assert f"Systems: Generator Monitoring System ({site.name})\n" in body

    sent.clear()
    users_router.assign_systems(target.id, UserAssignSystems(system_ids=[], site_ids=[]), db, admin)
    assert sent == []  # removals only


def test_customer_wide_role_assignment_is_announced_once(sent):
    db, company, _site, _system, _second, admin, target = setup()
    data = UserRoleAssign(role="system_operator", company_id=company.id, scope_type="company_wide")
    users_router.assign_role(target.id, data, db, admin)
    assert "sansab@example.com" in [to for to, _ in sent]
    assert f"All sites of {company.name}" in render_text(dict(sent)["sansab@example.com"])

    sent.clear()
    users_router.assign_role(target.id, data, db, admin)
    assert sent == []  # nothing changed


def test_switching_to_selected_scope_waits_for_assign_systems(sent):
    db, company, _site, _system, _second, admin, target = setup()
    target.scope_type = "company_wide"
    db.flush()
    users_router.assign_role(target.id, UserRoleAssign(role="system_viewer", company_id=company.id, scope_type="assigned"), db, admin)
    assert sent == []
