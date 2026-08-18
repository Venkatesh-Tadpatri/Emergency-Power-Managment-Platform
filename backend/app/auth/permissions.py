"""Central implementation of the PRD Section 6.3 permission matrix.

Role/scope authorization is local-DB-driven (User.role / User.scope_type /
User.reseller_id / User.company_id / UserAssignedSystem), not Zitadel claims —
Zitadel only proves identity. Every router calls into these helpers rather than
re-implementing scope checks, so the matrix lives in exactly one place.
"""
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.system import System
from app.models.user import User, UserAssignedSite, UserAssignedSystem


@dataclass
class Scope:
    all_access: bool = False
    reseller_id: str | None = None
    company_id: str | None = None
    assigned_system_ids: set[str] | None = None  # None = not restricted to a fixed set
    assigned_site_ids: set[str] | None = None


def get_scope(user: User, db: Session) -> Scope:
    if user.role == "superadmin":
        return Scope(all_access=True)
    if user.role == "reseller_admin":
        return Scope(reseller_id=user.reseller_id)
    if user.role in ("company_admin",):
        return Scope(company_id=user.company_id)
    if user.role in ("system_operator", "system_viewer"):
        if user.scope_type == "company_wide":
            return Scope(company_id=user.company_id)
        ids = {
            row.system_id
            for row in db.query(UserAssignedSystem).filter(
                UserAssignedSystem.user_id == user.id
            )
        }
        site_ids = {
            row.site_id
            for row in db.query(UserAssignedSite).filter(UserAssignedSite.user_id == user.id)
        }
        return Scope(assigned_system_ids=ids, assigned_site_ids=site_ids)
    # No role assigned yet (freshly auto-provisioned) — no access.
    return Scope(assigned_system_ids=set(), assigned_site_ids=set())


def can_view_reseller(user: User, db: Session, reseller_id: str) -> bool:
    scope = get_scope(user, db)
    if scope.all_access:
        return True
    return scope.reseller_id == reseller_id


def can_view_company(user: User, db: Session, company_id: str, reseller_id: str) -> bool:
    scope = get_scope(user, db)
    if scope.all_access:
        return True
    if scope.reseller_id is not None:
        return scope.reseller_id == reseller_id
    if scope.company_id is not None:
        return scope.company_id == company_id
    if scope.assigned_system_ids is not None:
        return (
            db.query(System)
            .filter(
                System.company_id == company_id,
                (System.id.in_(scope.assigned_system_ids)) | (System.site_id.in_(scope.assigned_site_ids or set())),
            )
            .first()
            is not None
        )
    return False


def can_view_system(user: User, db: Session, system: System) -> bool:
    scope = get_scope(user, db)
    if scope.all_access:
        return True
    if scope.reseller_id is not None:
        return scope.reseller_id == system.company.reseller_id
    if scope.company_id is not None:
        return scope.company_id == system.company_id
    return bool(
        scope.assigned_system_ids is not None
        and (system.id in scope.assigned_system_ids or system.site_id in (scope.assigned_site_ids or set()))
    )


def can_view_site(user: User, db: Session, site) -> bool:
    scope = get_scope(user, db)
    if scope.all_access:
        return True
    if scope.reseller_id is not None:
        return scope.reseller_id == site.customer.reseller_id
    if scope.company_id is not None:
        return scope.company_id == site.customer_id
    return bool(
        scope.assigned_site_ids is not None
        and (site.id in scope.assigned_site_ids or db.query(System).filter(
            System.site_id == site.id, System.id.in_(scope.assigned_system_ids or set())
        ).first() is not None)
    )


def can_manage_resellers(user: User) -> bool:
    return user.role == "superadmin"


def can_create_company(user: User, reseller_id: str) -> bool:
    if user.role == "superadmin":
        return True
    return user.role == "reseller_admin" and user.reseller_id == reseller_id


def can_write_company(user: User, db: Session, company_id: str, reseller_id: str) -> bool:
    if user.role == "superadmin":
        return True
    if user.role == "reseller_admin":
        return user.reseller_id == reseller_id
    return False


def can_write_system(user: User, db: Session, company_id: str, reseller_id: str) -> bool:
    """Only platform Super Admins may change sites or their equipment."""
    return user.role == "superadmin"


def can_manage_company_users(user: User, company_id: str, reseller_id: str) -> bool:
    if user.role == "superadmin":
        return True
    if user.role == "reseller_admin":
        return user.reseller_id == reseller_id
    if user.role == "company_admin":
        return user.company_id == company_id
    return False


def can_manage_oncall(user: User, company_id: str, reseller_id: str) -> bool:
    return can_manage_company_users(user, company_id, reseller_id)


def permissions_summary(user: User) -> dict:
    """Computed nav-gating object returned from GET /api/me."""
    return {
        "manage_resellers": user.role == "superadmin",
        "create_company": user.role in ("superadmin", "reseller_admin"),
        "manage_company_users": user.role in ("superadmin", "reseller_admin", "company_admin"),
        "manage_oncall": user.role in ("superadmin", "reseller_admin", "company_admin"),
        "run_tests": user.role
        in ("superadmin", "reseller_admin", "company_admin", "system_operator"),
        "is_scoped_to_own_company": user.role
        in ("company_admin", "system_operator", "system_viewer"),
        "has_role": user.role is not None,
    }


def require_role(*allowed_roles: str):
    def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "insufficient role")
        return user

    return _dep


def require_authenticated_with_role():
    def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role is None:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, "account is pending role assignment"
            )
        return user

    return _dep
