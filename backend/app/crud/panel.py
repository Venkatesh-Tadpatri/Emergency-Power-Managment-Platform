from sqlalchemy.orm import Session

from app.models.panel import Panel
from app.models.system import System
from app.schemas.panel import PanelCreate, PanelUpdate
from app.services.mqtt_topics import delete_device_topic


def list_panels(db: Session, system_id: str | None = None, site_id: str | None = None) -> list[Panel]:
    q = db.query(Panel)
    if system_id:
        q = q.filter(Panel.system_id == system_id)
    if site_id:
        q = q.join(System, Panel.system_id == System.id).filter(System.site_id == site_id)
    return q.order_by(Panel.name).all()


def get_panel(db: Session, panel_id: str) -> Panel | None:
    return db.get(Panel, panel_id)


def create_panel(db: Session, data: PanelCreate) -> Panel:
    panel = Panel(**data.model_dump())
    db.add(panel)
    db.commit()
    db.refresh(panel)
    return panel


def update_panel(db: Session, panel: Panel, data: PanelUpdate) -> Panel:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(panel, field, value)
    db.commit()
    db.refresh(panel)
    return panel


def delete_panel(db: Session, panel: Panel) -> None:
    # Generators, ATS units and monitored assets cascade with the panel; drop their
    # MQTT topic mappings too so stale telemetry routes are not left behind.
    for generator in panel.generators:
        delete_device_topic(db, generator.id, "generator")
    for ats in panel.ats_devices:
        delete_device_topic(db, ats.id, "ats")
    for asset in panel.monitored_assets:
        if asset.asset_type in {"ats", "generator"}:
            delete_device_topic(db, asset.id, asset.asset_type)
    db.delete(panel)
    db.commit()
