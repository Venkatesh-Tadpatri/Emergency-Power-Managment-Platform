from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.permissions import can_view_system, can_write_system
from app.crud import company as company_crud
from app.crud import system as crud
from app.database import get_db
from app.models.user import User
from app.schemas.system import SystemCreate, SystemRead, SystemUpdate

router = APIRouter(prefix="/api/systems", tags=["systems"])


@router.get("", response_model=list[SystemRead])
def list_systems(
    company_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    all_systems = crud.list_systems(db, company_id)
    return [s for s in all_systems if can_view_system(user, db, s)]


@router.post("", response_model=SystemRead, status_code=status.HTTP_201_CREATED)
def create_system(
    data: SystemCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    company = company_crud.get_company(db, data.company_id)
    if not company:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "company not found")
    if not can_write_system(user, db, company.id, company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to create systems here")
    return crud.create_system(db, data)


@router.get("/{system_id}", response_model=SystemRead)
def get_system(
    system_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    system = crud.get_system(db, system_id)
    if not system or not can_view_system(user, db, system):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "system not found")
    return system


@router.patch("/{system_id}", response_model=SystemRead)
def update_system(
    system_id: str,
    data: SystemUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    system = crud.get_system(db, system_id)
    if not system:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "system not found")
    if not can_write_system(user, db, system.company_id, system.company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to edit this system")
    return crud.update_system(db, system, data)


@router.delete("/{system_id}", response_model=SystemRead)
def archive_system(
    system_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    system = crud.get_system(db, system_id)
    if not system:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "system not found")
    if not can_write_system(user, db, system.company_id, system.company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to archive this system")
    return crud.archive_system(db, system)
