import pytest
from fastapi import HTTPException

from app.models.user import User
from app.routers.users import assign_role, create_user
from app.schemas.user import UserCreate, UserRoleAssign
from tests.test_operational_device_sync import make_db


def setup():
    db, system, _panel = make_db()
    company = system.company
    admin = User(email="super@example.com", display_name="Super", role="superadmin")
    target = User(email="target@example.com", display_name="Target", account_state="active")
    db.add_all([admin, target])
    db.flush()
    return db, company, admin, target


def new_user(company_id):
    return UserCreate(first_name="Nitya", last_name="Das", email="new@example.com", contact_number="+91 9876543210", company_id=company_id)


def test_role_cannot_be_assigned_under_archived_customer():
    db, company, admin, target = setup()
    company.status = "archived"
    db.flush()
    with pytest.raises(HTTPException) as error:
        assign_role(target.id, UserRoleAssign(role="company_admin", company_id=company.id), db, admin)
    assert error.value.status_code == 409


def test_role_cannot_be_assigned_under_customer_of_archived_reseller():
    db, company, admin, target = setup()
    company.reseller.status = "archived"
    db.flush()
    with pytest.raises(HTTPException) as error:
        assign_role(target.id, UserRoleAssign(role="system_operator", company_id=company.id, scope_type="company_wide"), db, admin)
    assert error.value.status_code == 409


def test_new_user_cannot_be_created_under_archived_customer():
    db, company, admin, _target = setup()
    company.status = "archived"
    db.flush()
    with pytest.raises(HTTPException) as error:
        create_user(new_user(company.id), db, admin)
    assert error.value.status_code == 409


def test_active_customer_still_accepts_role_assignment():
    db, company, admin, target = setup()
    updated = assign_role(target.id, UserRoleAssign(role="company_admin", company_id=company.id), db, admin)
    assert updated.company_id == company.id
