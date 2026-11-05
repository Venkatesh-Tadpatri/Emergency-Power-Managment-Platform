from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.permissions import can_view_company, can_view_reseller, can_view_system
from app.crud import alarm as crud
from app.crud import company as company_crud
from app.crud import system as system_crud
from app.database import get_db
from app.models.base import utcnow
from app.models.user import User
from app.schemas.alarm import AlarmAcknowledge, AlarmRead

router = APIRouter(prefix="/api/alarms", tags=["alarms"])


@router.get("", response_model=list[AlarmRead])
def list_alarms(
    system_id: str | None = Query(default=None),
    company_id: str | None = Query(default=None),
    reseller_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if system_id:
        system = system_crud.get_system(db, system_id)
        if not system or not can_view_system(user, db, system):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "system not found")
    elif company_id:
        company = company_crud.get_company(db, company_id)
        if not company or not can_view_company(user, db, company.id, company.reseller_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "company not found")
    elif reseller_id:
        if not can_view_reseller(user, db, reseller_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "reseller not found")
    elif user.role != "superadmin":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "a scope filter is required for this role")
    return [alarm for alarm in crud.list_alarms(db, system_id, company_id, reseller_id)
            if can_view_system(user, db, alarm.system)]


@router.patch("/{alarm_id}/acknowledge", response_model=AlarmRead)
def acknowledge_alarm(
    alarm_id: str,
    payload: AlarmAcknowledge,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    alarm = crud.get_alarm(db, alarm_id)
    if not alarm or not can_view_system(user, db, alarm.system):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "alarm not found")
    if user.role not in ("superadmin", "reseller_admin", "company_admin", "system_operator"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "alarm acknowledgment is not permitted")
    alarm.ack_by = user.display_name or user.email
    alarm.ack_at = utcnow()
    alarm.ack_comment = payload.comment.strip() if payload.comment and payload.comment.strip() else None
    db.commit()
    db.refresh(alarm)
    return alarm
