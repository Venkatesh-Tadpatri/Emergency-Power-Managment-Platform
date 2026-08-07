from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.company import Company
from app.models.user import User, UserAssignedSystem
from app.schemas.user import UserAssignSystems, UserRoleAssign


def list_users(
    db: Session, company_id: str | None = None, reseller_id: str | None = None
) -> list[User]:
    # Pending (role IS NULL) accounts have no tenant of their own yet, so they're
    # included in every scoped listing too — that's what lets a reseller/company
    # admin see and assign a just-signed-up person without already knowing their
    # exact email.
    q = db.query(User)
    if company_id:
        q = q.filter(or_(User.company_id == company_id, User.role.is_(None)))
    elif reseller_id:
        company_ids = [c.id for c in db.query(Company.id).filter(Company.reseller_id == reseller_id)]
        q = q.filter(
            or_(User.reseller_id == reseller_id, User.company_id.in_(company_ids), User.role.is_(None))
        )
    return q.order_by(User.role.is_(None).desc(), User.email).all()


def get_user(db: Session, user_id: str) -> User | None:
    return db.get(User, user_id)


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).one_or_none()


def assign_role(db: Session, user: User, data: UserRoleAssign) -> User:
    user.role = data.role
    user.scope_type = data.scope_type
    user.reseller_id = data.reseller_id
    user.company_id = data.company_id
    db.commit()
    db.refresh(user)
    return user


def assign_systems(db: Session, user: User, data: UserAssignSystems) -> User:
    db.query(UserAssignedSystem).filter(UserAssignedSystem.user_id == user.id).delete()
    for system_id in data.system_ids:
        db.add(UserAssignedSystem(user_id=user.id, system_id=system_id))
    db.commit()
    db.refresh(user)
    return user
