from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.permissions import can_view_system, can_write_system
from app.crud import ats as crud
from app.crud import panel as panel_crud
from app.database import get_db
from app.models.user import User
from app.schemas.ats import ATSCreate, ATSRead, ATSUpdate

router = APIRouter(prefix="/api/ats", tags=["ats"])


@router.get("", response_model=list[ATSRead])
def list_ats(
    panel_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    all_ats = crud.list_ats(db, panel_id)
    return [a for a in all_ats if can_view_system(user, db, a.panel.system)]


@router.post("", response_model=ATSRead, status_code=status.HTTP_201_CREATED)
def create_ats(
    data: ATSCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    panel = panel_crud.get_panel(db, data.panel_id)
    if not panel:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "panel not found")
    if not can_write_system(user, db, panel.system.company_id, panel.system.company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to add ATS devices here")
    return crud.create_ats(db, data)


@router.get("/{ats_id}", response_model=ATSRead)
def get_ats(ats_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ats = crud.get_ats(db, ats_id)
    if not ats or not can_view_system(user, db, ats.panel.system):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ATS not found")
    return ats


@router.patch("/{ats_id}", response_model=ATSRead)
def update_ats(
    ats_id: str,
    data: ATSUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ats = crud.get_ats(db, ats_id)
    if not ats:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ATS not found")
    system = ats.panel.system
    if not can_write_system(user, db, system.company_id, system.company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to edit this ATS")
    return crud.update_ats(db, ats, data)


@router.delete("/{ats_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ats(
    ats_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    ats = crud.get_ats(db, ats_id)
    if not ats:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ATS not found")
    system = ats.panel.system
    if not can_write_system(user, db, system.company_id, system.company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to delete this ATS")
    crud.delete_ats(db, ats)
