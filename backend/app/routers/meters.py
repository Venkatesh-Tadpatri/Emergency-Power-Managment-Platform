from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.permissions import can_view_system, can_write_system
from app.crud import ats as ats_crud
from app.crud import meter as crud
from app.database import get_db
from app.models.user import User
from app.schemas.meter import MeterCreate, MeterRead, MeterUpdate

router = APIRouter(prefix="/api/meters", tags=["meters"])


@router.get("", response_model=MeterRead | None)
def get_meter_for_ats(
    ats_id: str = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ats = ats_crud.get_ats(db, ats_id)
    if not ats or not can_view_system(user, db, ats.panel.system):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ATS not found")
    return crud.get_meter_by_ats(db, ats_id)


@router.post("", response_model=MeterRead, status_code=status.HTTP_201_CREATED)
def create_meter(
    data: MeterCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ats = ats_crud.get_ats(db, data.ats_id)
    if not ats:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ATS not found")
    system = ats.panel.system
    if not can_write_system(user, db, system.company_id, system.company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to add a meter here")
    if crud.get_meter_by_ats(db, data.ats_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "this ATS already has a meter")
    return crud.create_meter(db, data)


@router.patch("/{meter_id}", response_model=MeterRead)
def update_meter(
    meter_id: str,
    data: MeterUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    meter = crud.get_meter(db, meter_id)
    if not meter:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "meter not found")
    system = meter.ats.panel.system
    if not can_write_system(user, db, system.company_id, system.company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to edit this meter")
    return crud.update_meter(db, meter, data)


@router.delete("/{meter_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meter(
    meter_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    meter = crud.get_meter(db, meter_id)
    if not meter:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "meter not found")
    system = meter.ats.panel.system
    if not can_write_system(user, db, system.company_id, system.company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to delete this meter")
    crud.delete_meter(db, meter)
