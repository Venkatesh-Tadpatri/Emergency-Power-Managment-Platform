from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.permissions import can_view_system, can_write_system
from app.database import get_db
from app.models.ats import ATS
from app.models.monitored_asset import MonitoredAsset
from app.models.generator import Generator
from app.models.system import System
from app.models.user import User
from app.schemas.monitored_asset import MonitoredAssetCreate, MonitoredAssetRead, MonitoredAssetUpdate
from app.services.panel_limits import enforce_panel_limit

router = APIRouter(prefix="/api/monitored-assets", tags=["monitored-assets"])


def sync_operational_device(db: Session, row: MonitoredAsset) -> None:
    """Mirror commissioned ATS/generator assets into the live operational tables.

    Device Administration owns the richer commissioning record, while telemetry,
    System Details and portfolio cards read the dedicated device tables.  Keeping
    the same ID in both places gives one stable equipment identity everywhere.
    """
    if not row.panel_id or row.asset_type not in {"ats", "generator"}:
        return

    from app.services.mqtt_topics import sync_device_topic

    if row.asset_type == "ats":
        device = db.get(ATS, row.id)
        if not device:
            device = ATS(id=row.id, panel_id=row.panel_id, name=row.asset_tag)
            db.add(device)
        device.panel_id = row.panel_id
        device.name = row.asset_tag
        device.manufacturer = row.manufacturer
        device.model = row.model
        device.serial_number = row.serial_number
        device.branch = row.branch or "equipment"
        device.source_type = "utility"
        device.rated_amps = row.rating_amps
        device.rated_volts = row.voltage
        device.mqtt_topic = row.mqtt_topic
        device.power_mqtt_topic = row.power_topic
        db.flush()
        sync_device_topic(db, device, "ats")
        return

    device = db.get(Generator, row.id)
    if not device:
        device = Generator(id=row.id, panel_id=row.panel_id, name=row.asset_tag)
        db.add(device)
    device.panel_id = row.panel_id
    device.name = row.asset_tag
    device.make = row.manufacturer
    device.model = row.model
    device.serial_number = row.serial_number
    device.rated_volts = row.voltage
    device.rated_kw = row.rating_kw
    device.rated_kva = row.rating_kva
    device.description = row.description
    device.fuel_type = row.fuel_type
    device.engine = row.engine
    device.controller = row.controller
    device.install_date = row.install_date
    device.location = row.location
    device.notes = row.notes
    device.mqtt_topic = row.mqtt_topic
    device.power_mqtt_topic = row.power_topic
    db.flush()
    sync_device_topic(db, device, "generator")


def remove_operational_device(db: Session, device_id: str, asset_type: str) -> None:
    if asset_type not in {"ats", "generator"}:
        return
    from app.services.mqtt_topics import delete_device_topic

    model = ATS if asset_type == "ats" else Generator
    device = db.get(model, device_id)
    if device:
        delete_device_topic(db, device_id, asset_type)
        db.delete(device)


def validate_served_generators(db: Session, system_id: str, generator_ids: list[str] | None) -> None:
    for generator_id in generator_ids or []:
        legacy = db.get(Generator, generator_id)
        asset = db.get(MonitoredAsset, generator_id)
        valid_legacy = legacy and legacy.panel.system_id == system_id
        valid_asset = asset and asset.system_id == system_id and asset.asset_type == "generator"
        if not valid_legacy and not valid_asset:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"generator {generator_id} does not belong to this system")


def allowed(db: Session, user: User, system_id: str, write: bool = False) -> System:
    system = db.get(System, system_id)
    if not system or not can_view_system(user, db, system):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "system not found")
    if write and not can_write_system(user, db, system.company_id, system.company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to manage monitored assets")
    return system


@router.get("", response_model=list[MonitoredAssetRead])
def list_assets(system_id: str = Query(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    allowed(db, user, system_id)
    return db.query(MonitoredAsset).filter(MonitoredAsset.system_id == system_id).order_by(MonitoredAsset.asset_type, MonitoredAsset.asset_tag).all()


@router.post("", response_model=MonitoredAssetRead, status_code=status.HTTP_201_CREATED)
def create_asset(data: MonitoredAssetCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    allowed(db, user, data.system_id, True)
    duplicate = db.query(MonitoredAsset).filter(MonitoredAsset.system_id == data.system_id, MonitoredAsset.asset_tag == data.asset_tag).first()
    if duplicate:
        raise HTTPException(status.HTTP_409_CONFLICT, "asset tag already exists in this system")
    if data.panel_id and data.slot:
        occupied = db.query(MonitoredAsset).filter(MonitoredAsset.panel_id == data.panel_id, MonitoredAsset.slot == data.slot).first()
        if occupied:
            raise HTTPException(status.HTTP_409_CONFLICT, "PLC slot is already occupied")
    enforce_panel_limit(db, data.panel_id, data.asset_type, slot=data.slot)
    if data.asset_type == "fuel_tank":
        validate_served_generators(db, data.system_id, data.served_generator_ids)
    row = MonitoredAsset(**data.model_dump())
    if row.panel_id:
        from app.models.panel import Panel
        panel = db.get(Panel, row.panel_id)
        if not panel or panel.system_id != data.system_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "panel does not belong to this system")
        panel.sync_status = "pending"
    db.add(row)
    db.flush()
    try:
        sync_operational_device(db, row)
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    db.refresh(row)
    return row


@router.patch("/{asset_id}", response_model=MonitoredAssetRead)
def update_asset(asset_id: str, data: MonitoredAssetUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = db.get(MonitoredAsset, asset_id)
    if not row: raise HTTPException(status.HTTP_404_NOT_FOUND, "asset not found")
    allowed(db, user, row.system_id, True)
    values = data.model_dump(exclude_unset=True)
    previous_asset_type = row.asset_type
    next_asset_type = values.get("asset_type", row.asset_type)
    next_frame_amps = values.get("rating_amps", row.rating_amps)
    next_trip_amps = values.get("trip_amps", row.trip_amps)
    if next_asset_type == "breaker":
        if next_frame_amps is None or next_trip_amps is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "breaker frame size and trip rating are required")
        if next_frame_amps <= 0 or next_trip_amps <= 0:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "breaker frame size and trip rating must be greater than zero")
        if next_trip_amps >= next_frame_amps:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "trip rating must be less than frame size")
    if row.asset_type == "fuel_tank" or values.get("asset_type") == "fuel_tank":
        validate_served_generators(db, row.system_id, values.get("served_generator_ids", row.served_generator_ids))
    next_tag = values.get("asset_tag")
    if next_tag and db.query(MonitoredAsset).filter(MonitoredAsset.system_id == row.system_id, MonitoredAsset.asset_tag == next_tag, MonitoredAsset.id != row.id).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "asset tag already exists in this system")
    next_panel = values.get("panel_id", row.panel_id)
    next_slot = values.get("slot", row.slot)
    if next_panel and next_slot and db.query(MonitoredAsset).filter(MonitoredAsset.panel_id == next_panel, MonitoredAsset.slot == next_slot, MonitoredAsset.id != row.id).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "PLC slot is already occupied")
    # Only re-check the limit when the device is placed somewhere new, so assets that
    # already exceed a lowered limit can still have their details edited.
    if next_panel and (next_panel != row.panel_id or next_asset_type != row.asset_type or next_slot != row.slot):
        enforce_panel_limit(db, next_panel, next_asset_type, exclude_id=row.id, slot=next_slot)
    if next_panel:
        from app.models.panel import Panel
        panel = db.get(Panel, next_panel)
        if not panel or panel.system_id != row.system_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "panel does not belong to this system")
    for key, value in values.items(): setattr(row, key, value)
    row.status = "pending"
    if row.panel: row.panel.sync_status = "pending"
    try:
        if previous_asset_type in {"ats", "generator"} and (
            row.asset_type != previous_asset_type or not row.panel_id
        ):
            remove_operational_device(db, row.id, previous_asset_type)
        sync_operational_device(db, row)
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    db.refresh(row)
    return row


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(asset_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = db.get(MonitoredAsset, asset_id)
    if not row: raise HTTPException(status.HTTP_404_NOT_FOUND, "asset not found")
    allowed(db, user, row.system_id, True)
    if row.panel: row.panel.sync_status = "pending"
    remove_operational_device(db, row.id, row.asset_type)
    db.delete(row); db.commit()
