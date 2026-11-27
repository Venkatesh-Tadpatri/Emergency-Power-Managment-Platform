from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.permissions import can_manage_company_users, can_view_reseller
from app.crud import company as company_crud
from app.crud import user as crud
from app.database import get_db
from app.models.user import User, UserAssignedSite, UserAssignedSystem
from app.services import access_notifications as notifications
from app.schemas.user import UserAssignSystems, UserCreate, UserRead, UserRoleAssign, UserStateUpdate
from app.services.email import EmailDeliveryError, send_account_created_email

router = APIRouter(prefix="/api/users", tags=["users"])

ADMIN_ROLES = ("superadmin", "reseller_admin", "company_admin")
INVITED = "invited"


class UserCreateResult(BaseModel):
    user: UserRead
    email_sent: bool
    message: str


def _require_admin(user: User) -> None:
    if user.role not in ADMIN_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only Super Admins, Reseller Admins and Customer Admins can manage user accounts")


def _require_active_customer(company) -> None:
    """New users and role changes may only be placed under an active customer. A customer counts as
    inactive when it is archived itself or when its reseller has been archived."""
    if company.status == "archived":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Customer '{company.name}' is archived. Choose an active customer.")
    if company.reseller is not None and company.reseller.status == "archived":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Customer '{company.name}' belongs to an archived reseller. Choose an active customer.")


def _can_manage_target(db: Session, user: User, target: User) -> bool:
    """Who may manage an account: anyone who manages the customer or reseller it belongs to."""
    if user.role == "superadmin":
        return True
    if target.company_id:
        company = company_crud.get_company(db, target.company_id)
        return bool(company and can_manage_company_users(user, company.id, company.reseller_id))
    if target.reseller_id:
        return user.role == "reseller_admin" and user.reseller_id == target.reseller_id
    return False


def _notify_created(target: User, inviter: User) -> tuple[bool, str]:
    name = " ".join(part for part in (target.first_name, target.last_name) if part) or target.display_name
    try:
        sent = send_account_created_email(target.email, name, inviter.display_name or inviter.email)
    except EmailDeliveryError:
        return False, f"The account was created, but the email to {target.email} could not be sent. Use Resend email to try again."
    if not sent:
        return False, f"The account was created. Email is not configured on the server, so the notice for {target.email} was written to the server log."
    return True, f"An email has been sent to {target.email} with first-time login instructions."


@router.get("/check-email")
def check_email(email: str = Query(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Duplicate check for the Create User form. Emails are unique platform-wide."""
    _require_admin(user)
    return {"available": crud.get_user_by_email(db, email.strip().lower()) is None}


@router.post("", response_model=UserCreateResult, status_code=status.HTTP_201_CREATED)
def create_user(data: UserCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Create an account and email the user. It stays 'invited' until they complete
    First-time login (OTP + password); access is assigned after that."""
    _require_admin(user)
    company_id, reseller_id = data.company_id, data.reseller_id
    if user.role == "company_admin":
        company_id = company_id or user.company_id
    if user.role == "reseller_admin" and not company_id:
        reseller_id = reseller_id or user.reseller_id
    if company_id:
        company = company_crud.get_company(db, company_id)
        if not company:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "customer not found")
        if not can_manage_company_users(user, company.id, company.reseller_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to create users for this customer")
        _require_active_customer(company)
        reseller_id = company.reseller_id
    elif reseller_id:
        if not (user.role == "superadmin" or (user.role == "reseller_admin" and user.reseller_id == reseller_id)):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to create users for this reseller")
    elif user.role != "superadmin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "choose the customer this user belongs to")

    email = str(data.email).strip().lower()
    if crud.get_user_by_email(db, email):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    target = User(
        email=email,
        first_name=data.first_name,
        last_name=data.last_name,
        display_name=f"{data.first_name} {data.last_name}",
        contact_number=data.contact_number,
        role=None,
        reseller_id=reseller_id,
        company_id=company_id,
        account_state=INVITED,
        is_active=True,
        password_hash=None,
        email_verified_at=None,
        invited_at=datetime.utcnow(),
        invited_by=user.display_name or user.email,
    )
    db.add(target)
    db.commit()
    db.refresh(target)
    email_sent, message = _notify_created(target, user)
    return UserCreateResult(user=target, email_sent=email_sent, message=message)


@router.post("/{user_id}/resend-invite", response_model=UserCreateResult)
def resend_invite(user_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_admin(user)
    target = crud.get_user(db, user_id)
    if not target or not _can_manage_target(db, user, target):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")
    if target.account_state != INVITED:
        raise HTTPException(status.HTTP_409_CONFLICT, "This user has already activated their account")
    target.invited_at = datetime.utcnow()
    db.commit()
    db.refresh(target)
    email_sent, message = _notify_created(target, user)
    return UserCreateResult(user=target, email_sent=email_sent, message=message)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_invite(user_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Remove an account that was created but never activated (e.g. a mistyped email)."""
    _require_admin(user)
    target = crud.get_user(db, user_id)
    if not target or not _can_manage_target(db, user, target):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")
    if target.account_state == INVITED:
        crud.delete_user(db, target)
        return
    # Permanently deleting an activated account is a Super Admin action with retention rules:
    # never yourself or another Super Admin, and only after the account has been deactivated,
    # so access is always cut off (and reviewed) before the record is removed.
    if user.role != "superadmin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a Super Admin can permanently delete an activated account. Deactivate it instead.")
    if target.id == user.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "You cannot delete your own account.")
    if target.role == "superadmin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Super Admin accounts cannot be deleted here.")
    if target.account_state != "suspended":
        raise HTTPException(status.HTTP_409_CONFLICT, "Deactivate this user before deleting the account.")
    crud.delete_user(db, target)


@router.get("", response_model=list[UserRead])
def list_users(
    company_id: str | None = Query(default=None),
    reseller_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if company_id:
        company = company_crud.get_company(db, company_id)
        if not company or not can_manage_company_users(user, company.id, company.reseller_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to view these users")
        return crud.list_users(db, company_id=company_id)
    if reseller_id:
        if not can_view_reseller(user, db, reseller_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to view these users")
        return crud.list_users(db, reseller_id=reseller_id)
    if user.role != "superadmin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "company_id is required for this role")
    return crud.list_users(db)


@router.patch("/{user_id}/role", response_model=UserRead)
def assign_role(
    user_id: str,
    data: UserRoleAssign,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    target = crud.get_user(db, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")
    # The superadmin role is never granted through the portal, and existing
    # superadmin accounts cannot be re-roled from here.
    if data.role == "superadmin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "the superadmin role cannot be assigned")
    if target.role == "superadmin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "superadmin accounts cannot be changed here")
    if target.account_state == INVITED:
        raise HTTPException(status.HTTP_409_CONFLICT, "This user has not activated their account yet. Access can be assigned after their first login.")
    # Once a Reseller Admin is bound to a reseller, that role and reseller are fixed.
    if target.role == "reseller_admin" and target.reseller_id:
        if data.role != "reseller_admin" or data.reseller_id != target.reseller_id:
            raise HTTPException(status.HTTP_409_CONFLICT, "This user is already a Reseller Admin for a reseller. Their role and reseller cannot be changed.")
    # A reseller has exactly one Reseller Admin.
    if data.role == "reseller_admin" and data.reseller_id:
        existing_admin = (
            db.query(User)
            .filter(User.role == "reseller_admin", User.reseller_id == data.reseller_id, User.id != target.id)
            .first()
        )
        if existing_admin:
            holder = existing_admin.display_name or existing_admin.email
            raise HTTPException(status.HTTP_409_CONFLICT, f"A Reseller Admin is already assigned for this reseller ({holder}).")
    # Determine the company/reseller this role assignment would place the user under,
    # and require the caller to already manage that scope.
    company_id = data.company_id
    reseller_id = data.reseller_id
    if company_id:
        company = company_crud.get_company(db, company_id)
        if not company:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "company not found")
        reseller_id = company.reseller_id
        if not can_manage_company_users(user, company_id, reseller_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to assign this role")
        _require_active_customer(company)
    elif user.role != "superadmin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only superadmin can assign reseller-level roles")
    before = (target.role, target.company_id, target.scope_type)
    updated = crud.assign_role(db, target, data)
    # Customer-wide access (Customer Admin, or an Operator/Viewer scoped to the whole customer) is
    # granted right here. "Selected sites and equipment" access is notified by assign_systems instead,
    # once the actual sites/equipment are saved.
    customer_wide = updated.company_id and (
        updated.role == "company_admin"
        or (updated.role in ("system_operator", "system_viewer") and updated.scope_type == "company_wide")
    )
    if customer_wide and before != (updated.role, updated.company_id, updated.scope_type):
        notifications.dispatch(notifications.customer_wide_messages(db, updated, company, user, datetime.utcnow()))
    return updated


@router.patch("/{user_id}/assigned-systems", response_model=UserRead)
def assign_systems(
    user_id: str,
    data: UserAssignSystems,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    target = crud.get_user(db, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")
    if not target.company_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "user has no company scope yet")
    company = company_crud.get_company(db, target.company_id)
    if not company or not can_manage_company_users(user, company.id, company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to manage this user")
    previous_sites = {row.site_id for row in db.query(UserAssignedSite).filter(UserAssignedSite.user_id == target.id)}
    previous_systems = {row.system_id for row in db.query(UserAssignedSystem).filter(UserAssignedSystem.user_id == target.id)}
    try:
        updated = crud.assign_systems(db, target, data)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    # Only newly granted sites/equipment are announced; removals and unchanged saves send nothing.
    notifications.dispatch(notifications.assignment_messages(
        db, updated, company, user,
        set(data.site_ids) - previous_sites,
        set(data.system_ids) - previous_systems,
        datetime.utcnow(),
    ))
    return updated


@router.patch("/{user_id}/state", response_model=UserRead)
def update_account_state(user_id: str, data: UserStateUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    target = crud.get_user(db, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")
    if target.account_state == INVITED:
        raise HTTPException(status.HTTP_409_CONFLICT, "This user has not activated their account yet.")
    _require_admin(user)
    if not _can_manage_target(db, user, target):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to manage this user")
    if target.id == user.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "You cannot change the status of your own account.")
    if target.role == "superadmin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Super Admin accounts cannot be changed here.")
    target.account_state = data.account_state
    target.is_active = data.account_state == "active"
    if data.account_state == "active":
        target.failed_login_attempts = 0
        target.locked_until = None
    db.commit()
    db.refresh(target)
    return target
