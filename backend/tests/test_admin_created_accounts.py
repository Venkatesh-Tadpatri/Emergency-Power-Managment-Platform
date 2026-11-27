"""Admin-created accounts: create → email → First-time login (OTP → password) → sign in → assign access."""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.company import Company
from app.models.user import User
from app.routers import auth as auth_router
from app.routers import users as users_router
from app.schemas.auth import EmailRequest, FirstLoginCompleteRequest, LoginRequest, OtpVerifyRequest
from app.schemas.user import UserCreate, UserRoleAssign
from tests.test_operational_device_sync import make_db

PASSWORD = "Str0ng!Passw0rd"


def setup():
    db, _system, _panel = make_db()
    company = db.query(Company).first()
    superadmin = User(email="root@cpc.local", role="superadmin", account_state="active", is_active=True)
    company_admin = User(email="admin@example.com", role="company_admin", company_id=company.id,
                         reseller_id=company.reseller_id, account_state="active", is_active=True)
    db.add_all([superadmin, company_admin])
    db.commit()
    return db, company, superadmin, company_admin


def new_user(email="priya@example.com", company_id=None):
    return UserCreate(first_name="Priya", last_name="Sharma", email=email,
                      contact_number="+91 9876543210", company_id=company_id)


def request():
    return SimpleNamespace(client=SimpleNamespace(host="test"))


def activate(db, email):
    sent = auth_router.first_login_start(EmailRequest(email=email), db)
    assert sent.dev_otp, "without SMTP the code is returned for development"
    token = auth_router.first_login_verify(OtpVerifyRequest(email=email, code=sent.dev_otp), db)
    return auth_router.first_login_complete(FirstLoginCompleteRequest(setup_token=token.setup_token, password=PASSWORD), db)


def test_company_admin_creates_user_pinned_to_their_customer():
    db, company, _root, admin = setup()
    result = users_router.create_user(new_user(), db, admin)
    assert result.user.account_state == "invited"
    assert result.user.company_id == company.id
    assert result.user.role is None
    assert result.email_sent is False  # SMTP not configured in tests; notice is logged


def test_duplicate_email_is_rejected():
    db, _company, root, _admin = setup()
    users_router.create_user(new_user(), db, root)
    with pytest.raises(HTTPException) as error:
        users_router.create_user(new_user(email="PRIYA@example.com"), db, root)
    assert error.value.status_code == 409
    assert users_router.check_email("priya@example.com", db, root) == {"available": False}


def test_full_first_login_flow_then_sign_in():
    db, _company, _root, admin = setup()
    users_router.create_user(new_user(), db, admin)

    with pytest.raises(HTTPException) as blocked:  # cannot sign in before activation
        auth_router.login(LoginRequest(email="priya@example.com", password="anything"), request(), db)
    assert blocked.value.status_code == 403

    activate(db, "priya@example.com")
    user = db.query(User).filter_by(email="priya@example.com").one()
    assert user.account_state == "active" and user.email_verified_at is not None

    token = auth_router.login(LoginRequest(email="priya@example.com", password=PASSWORD), request(), db)
    assert token.access_token


def test_wrong_code_does_not_activate():
    db, _company, _root, admin = setup()
    users_router.create_user(new_user(), db, admin)
    sent = auth_router.first_login_start(EmailRequest(email="priya@example.com"), db)
    wrong = "000000" if sent.dev_otp != "000000" else "111111"
    with pytest.raises(HTTPException):
        auth_router.first_login_verify(OtpVerifyRequest(email="priya@example.com", code=wrong), db)
    assert db.query(User).filter_by(email="priya@example.com").one().account_state == "invited"


def test_first_login_rejects_unknown_and_already_active_accounts():
    db, _company, _root, admin = setup()
    with pytest.raises(HTTPException) as unknown:
        auth_router.first_login_start(EmailRequest(email="nobody@example.com"), db)
    assert unknown.value.status_code == 404
    with pytest.raises(HTTPException) as active:
        auth_router.first_login_start(EmailRequest(email=admin.email), db)
    assert active.value.status_code == 409


def test_setup_token_cannot_be_reused():
    db, _company, _root, admin = setup()
    users_router.create_user(new_user(), db, admin)
    sent = auth_router.first_login_start(EmailRequest(email="priya@example.com"), db)
    token = auth_router.first_login_verify(OtpVerifyRequest(email="priya@example.com", code=sent.dev_otp), db)
    auth_router.first_login_complete(FirstLoginCompleteRequest(setup_token=token.setup_token, password=PASSWORD), db)
    with pytest.raises(HTTPException):
        auth_router.first_login_complete(FirstLoginCompleteRequest(setup_token=token.setup_token, password="An0ther!Passw0rd"), db)


def test_access_is_assigned_only_after_first_login():
    db, company, _root, admin = setup()
    created = users_router.create_user(new_user(), db, admin).user
    role = UserRoleAssign(role="system_viewer", scope_type="company_wide", company_id=company.id)
    with pytest.raises(HTTPException) as early:
        users_router.assign_role(created.id, role, db, admin)
    assert early.value.status_code == 409

    activate(db, "priya@example.com")
    updated = users_router.assign_role(created.id, role, db, admin)
    assert updated.role == "system_viewer"


def test_unactivated_account_can_be_deleted_but_active_one_cannot():
    db, _company, _root, admin = setup()
    created = users_router.create_user(new_user(), db, admin).user
    users_router.cancel_invite(created.id, db, admin)
    assert db.query(User).filter_by(email="priya@example.com").one_or_none() is None
    with pytest.raises(HTTPException):
        users_router.cancel_invite(admin.id, db, admin)


def test_self_registration_is_closed():
    with pytest.raises(HTTPException) as error:
        auth_router.register()
    assert error.value.status_code == 410
