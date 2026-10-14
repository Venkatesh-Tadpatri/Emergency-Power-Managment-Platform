from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.permissions import can_view_system
from app.crud.system import get_system
from app.database import get_db
from app.models.user import User
from app.models.mqtt_topic_mapping import MqttTopicMapping
from app.services.telemetry import latest_system_snapshot, telemetry_bridge

router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])


@router.get("/status")
def telemetry_status(_user: User = Depends(get_current_user)):
    return {
        "mqtt_connected": telemetry_bridge.connected,
        "last_message_topic": telemetry_bridge.last_message_topic,
        "last_error": telemetry_bridge.last_error,
    }


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


@router.get("/systems/{system_id}/topics")
def system_topic_mappings(
    system_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    system = get_system(db, system_id)
    if not system or not can_view_system(user, db, system):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "system not found")
    mappings = db.query(MqttTopicMapping).filter(
        MqttTopicMapping.system_id == system_id,
        MqttTopicMapping.enabled.is_(True),
    ).order_by(MqttTopicMapping.base_topic).all()
    return [{
        "id": item.id,
        "system_id": item.system_id,
        "panel_id": item.panel_id,
        "device_type": item.device_type,
        "device_id": item.device_id,
        "base_topic": item.base_topic,
        "status_topic": f"{item.base_topic}/STATUS",
        "power_topic": f"{item.base_topic}/POWER",
        "enabled": item.enabled,
    } for item in mappings]
