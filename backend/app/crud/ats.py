from sqlalchemy.orm import Session

from app.models.ats import ATS
from app.models.panel import Panel
from app.schemas.ats import ATSCreate, ATSUpdate
from app.services.mqtt_topics import delete_device_topic, sync_device_topic


def list_ats(db: Session, panel_id: str | None = None, system_id: str | None = None) -> list[ATS]:
    q = db.query(ATS)
    if panel_id:
        q = q.filter(ATS.panel_id == panel_id)
    if system_id:
        q = q.join(Panel, ATS.panel_id == Panel.id).filter(Panel.system_id == system_id)
    return q.order_by(ATS.name).all()


def get_ats(db: Session, ats_id: str) -> ATS | None:
    return db.get(ATS, ats_id)


def create_ats(db: Session, data: ATSCreate) -> ATS:
    ats = ATS(**data.model_dump())
    db.add(ats)
    db.flush()
    sync_device_topic(db, ats, "ats")
    db.commit()
    db.refresh(ats)
    return ats


def update_ats(db: Session, ats: ATS, data: ATSUpdate) -> ATS:
    previous_power_topic = ats.power_mqtt_topic
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(ats, field, value)
    sync_device_topic(db, ats, "ats")
    power_topic_changed = previous_power_topic != ats.power_mqtt_topic
    db.commit()
    db.refresh(ats)
    if power_topic_changed:
        # Import locally to avoid a module cycle during application startup.
        from app.services.telemetry import telemetry_bridge
        telemetry_bridge.activate_cached_power_topic("ats", ats.id, ats.power_mqtt_topic)
    return ats


def delete_ats(db: Session, ats: ATS) -> None:
    delete_device_topic(db, ats.id, "ats")
    db.delete(ats)
    db.commit()
