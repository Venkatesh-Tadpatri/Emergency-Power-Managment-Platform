from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.permissions import can_manage_company_users, can_view_reseller
from app.crud import company as company_crud
from app.crud import user as crud
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserAssignSystems, UserRead, UserRoleAssign

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/lookup", response_model=UserRead | None)
def lookup_unassigned_user(
    email: str = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Find a signed-up-but-not-yet-assigned user by exact email, so a
    reseller/company admin can hand them a role. Only ever returns users
    with no role yet — already-assigned accounts stay invisible outside
    their own scope's normal user lists."""
    if user.role not in ("superadmin", "reseller_admin", "company_admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to look up users")
    target = crud.get_user_by_email(db, email)
    if not target or target.role is not None:
        return None
    return target


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
    elif user.role != "superadmin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only superadmin can assign reseller-level roles")
    return crud.assign_role(db, target, data)


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
    return crud.assign_systems(db, target, data)
