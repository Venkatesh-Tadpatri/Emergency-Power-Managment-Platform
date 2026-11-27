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
from app.models.asset_alarm_disable import AssetAlarmDisable
from app.schemas.system import AlarmDisableRequest, AlarmDisableStatus, AssetAlarmDisableList, AssetAlarmDisableRequest, AssetAlarmDisableStatus, SystemCreate, SystemEventRead, SystemRead, SystemUpdate
from app.services.alarm_disable import (
    asset_payload,
    can_control_alarms,
    disable_alarms,
    disable_asset_alarms,
    enable_alarms,
    enable_asset_alarms,
    ensure_utc,
    expire_asset_disables,
    status_payload,
)
from app.models.base import utcnow
from app.services.system_status import present_system, present_systems

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
    include_archived: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    all_systems = crud.list_systems(db, company_id, site_id, include_archived)
    return present_systems(db, [s for s in all_systems if can_view_system(user, db, s)])


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
        if crud.get_system_by_name(db, data.site_id, data.name):
            raise HTTPException(status.HTTP_409_CONFLICT, "a system with the same name already exists for this site")
    return present_system(db, crud.create_system(db, data))


@router.get("/{system_id}", response_model=SystemRead)
def get_system(
    system_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    system = crud.get_system(db, system_id)
    if not system or not can_view_system(user, db, system):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "system not found")
    return present_system(db, system)


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


# Per-asset alarm disable: the same durations, required reason, automatic re-enable and badge as the
# system-level control above, scoped to one asset by the record_key its popup uses for Notes.
@router.get("/{system_id}/asset-alarm-disables", response_model=AssetAlarmDisableList)
def list_asset_alarm_disables(system_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    system = _visible_system(db, user, system_id)
    expire_asset_disables(db, system)
    rows = db.query(AssetAlarmDisable).filter(AssetAlarmDisable.system_id == system.id).all()
    return {"can_control": can_control_alarms(user, db, system), "disables": [asset_payload(row) for row in rows]}


@router.post("/{system_id}/asset-alarm-disables", response_model=AssetAlarmDisableStatus)
def set_asset_alarm_disable(system_id: str, data: AssetAlarmDisableRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    system = _visible_system(db, user, system_id)
    if not can_control_alarms(user, db, system):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "this role cannot disable alarms")
    return disable_asset_alarms(db, system, user, data.record_key, data.asset_name.strip(), data.duration, data.reason)


@router.delete("/{system_id}/asset-alarm-disables", status_code=status.HTTP_204_NO_CONTENT)
def clear_asset_alarm_disable(
    system_id: str,
    record_key: str = Query(min_length=1, max_length=255),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    system = _visible_system(db, user, system_id)
    if not can_control_alarms(user, db, system):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "this role cannot re-enable alarms")
    row = db.query(AssetAlarmDisable).filter(AssetAlarmDisable.system_id == system.id, AssetAlarmDisable.record_key == record_key).one_or_none()
    if row is not None:
        enable_asset_alarms(db, system, row, user=user)


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
    target_site_id = data.site_id or system.site_id
    if data.name is not None and target_site_id and crud.get_system_by_name(db, target_site_id, data.name, exclude_id=system.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "a system with the same name already exists for this site")
    return present_system(db, crud.update_system(db, system, data))


@router.delete("/{system_id}", response_model=SystemRead)
def archive_system(
    system_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    system = crud.get_system(db, system_id)
    if not system:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "system not found")
    if not can_write_system(user, db, system.company_id, system.company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to archive this system")
    return present_system(db, crud.archive_system(db, system))


@router.post("/{system_id}/unarchive", response_model=SystemRead)
def unarchive_system(
    system_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    system = crud.get_system(db, system_id)
    if not system:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "system not found")
    if not can_write_system(user, db, system.company_id, system.company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to unarchive this system")
    return present_system(db, crud.unarchive_system(db, system))


@router.delete("/{system_id}/permanent", status_code=status.HTTP_204_NO_CONTENT)
def delete_system_permanently(
    system_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    system = crud.get_system(db, system_id)
    if not system:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "system not found")
    if not system.archived:
        raise HTTPException(status.HTTP_409_CONFLICT, "system must be archived before it can be deleted")
    if not can_write_system(user, db, system.company_id, system.company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to delete this system")
    crud.delete_system(db, system)
