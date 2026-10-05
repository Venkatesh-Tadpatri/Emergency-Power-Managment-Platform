from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.permissions import can_view_system
from app.crud.system import get_system
from app.database import get_db
from app.models.user import User
from app.services.telemetry import latest_system_snapshot

router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])


@router.get("/systems/{system_id}/latest")
def latest_system_telemetry(
    system_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    system = get_system(db, system_id)
    if not system or not can_view_system(user, db, system):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "system not found")
    generators = [device for panel in system.panels for device in panel.generators]
    ats_devices = [device for panel in system.panels for device in panel.ats_devices]
    return latest_system_snapshot(system, generators, ats_devices)
