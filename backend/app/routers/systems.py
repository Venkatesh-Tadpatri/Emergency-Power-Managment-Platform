from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.permissions import can_view_system, can_write_system
from app.crud import company as company_crud
from app.crud import site as site_crud
from app.crud import system as crud
from app.database import get_db
from app.models.user import User
from app.models.system import SystemEvent
from app.schemas.system import AlarmDisableRequest, AlarmDisableStatus, SystemCreate, SystemEventRead, SystemRead, SystemUpdate
from app.services.alarm_disable import can_control_alarms, disable_alarms, enable_alarms, ensure_utc, status_payload
from app.models.base import utcnow

router = APIRouter(prefix="/api/systems", tags=["systems"])


def _visible_system(db: Session, user: User, system_id: str):
    system = crud.get_system(db, system_id)
    if not system or not can_view_system(user, db, system):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "system not found")
    return system


@router.get("", response_model=list[SystemRead])
def list_systems(
    company_id: str | None = Query(default=None),
    site_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    all_systems = crud.list_systems(db, company_id, site_id)
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
    if data.site_id:
        site = site_crud.get_site(db, data.site_id)
        if not site or site.customer_id != company.id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "site must belong to the selected customer")
    return crud.create_system(db, data)


@router.get("/{system_id}", response_model=SystemRead)
def get_system(
    system_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    system = crud.get_system(db, system_id)
    if not system or not can_view_system(user, db, system):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "system not found")
    return system


@router.get("/{system_id}/alarm-disable", response_model=AlarmDisableStatus)
def get_alarm_disable_status(system_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    system = _visible_system(db, user, system_id)
    until = ensure_utc(system.alarms_disabled_until)
    if system.alarms_disabled and until and until <= utcnow():
        enable_alarms(db, system, automatic=True)
    return status_payload(system, can_control_alarms(user, db, system))


@router.post("/{system_id}/alarm-disable", response_model=AlarmDisableStatus)
def set_alarm_disable(system_id: str, data: AlarmDisableRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    system = _visible_system(db, user, system_id)
    if not can_control_alarms(user, db, system):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "this role cannot disable alarms")
    return disable_alarms(db, system, user, data.duration, data.reason)


@router.delete("/{system_id}/alarm-disable", response_model=AlarmDisableStatus)
def clear_alarm_disable(system_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    system = _visible_system(db, user, system_id)
    if not can_control_alarms(user, db, system):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "this role cannot re-enable alarms")
    return enable_alarms(db, system, user=user)


@router.get("/{system_id}/events", response_model=list[SystemEventRead])
def list_system_events(system_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _visible_system(db, user, system_id)
    return db.query(SystemEvent).filter(SystemEvent.system_id == system_id).order_by(SystemEvent.occurred_at.desc()).limit(100).all()


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
