from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.permissions import can_view_system
from app.crud.system import get_system
from app.database import get_db
from app.models.user import User
from app.models.mqtt_topic_mapping import MqttTopicMapping
from app.models.monitored_asset import MonitoredAsset
from app.services.telemetry import latest_system_snapshot, telemetry_bridge
from app.services.telemetry_history import RANGES, HistoryUnavailable, device_history

router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])

MAX_HISTORY_SYSTEMS = 50


@router.get("/history")
def telemetry_history(
    system_ids: str = Query(..., description="Comma-separated system IDs"),
    range: str = Query(default="24h", description=f"One of: {', '.join(RANGES)}"),
    device_id: str | None = Query(default=None, description="Limit to one generator/ATS"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Bucketed InfluxDB history for the in-app analytics charts.

    Systems the caller cannot see are silently dropped (same rule as the systems list), so a
    mixed request never leaks another tenant's data; asking only for invisible systems is a 404.
    """
    if range not in RANGES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"range must be one of {', '.join(RANGES)}")
    requested = [item.strip() for item in system_ids.split(",") if item.strip()]
    if not requested:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "system_ids is required")
    if len(requested) > MAX_HISTORY_SYSTEMS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"at most {MAX_HISTORY_SYSTEMS} systems per request")

    devices = []
    visible = 0
    for system_id in dict.fromkeys(requested):
        system = get_system(db, system_id)
        if not system or not can_view_system(user, db, system):
            continue
        visible += 1
        for panel in system.panels:
            for generator in panel.generators:
                if generator.mqtt_topic or generator.power_mqtt_topic:
                    devices.append({"id": generator.id, "type": "generator", "name": generator.name, "system_id": system.id, "rated_kw": generator.rated_kw})
            for ats in panel.ats_devices:
                if ats.mqtt_topic or ats.power_mqtt_topic:
                    devices.append({"id": ats.id, "type": "ats", "name": ats.name, "system_id": system.id})
    if not visible:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "system not found")
    if device_id:
        devices = [device for device in devices if device["id"] == device_id]
        if not devices:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "device not found")
    try:
        return device_history(devices, range)
    except HistoryUnavailable as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc


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
    fuel_tanks = db.query(MonitoredAsset).filter(MonitoredAsset.system_id == system_id, MonitoredAsset.asset_type == "fuel_tank").all()
    return latest_system_snapshot(system, generators, ats_devices, fuel_tanks)


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
