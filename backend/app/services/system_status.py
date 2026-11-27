"""Connection-aware system status.

The stored ``systems.status`` column is only meaningful while the system is actually reporting.
A system is online only when one of its MQTT-mapped devices (generator, ATS or fuel tank) has sent
a packet recently; everything else is reported as ``offline`` regardless of the stored value.
"""

from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.config import settings
from app.models.ats import ATS
from app.models.generator import Generator
from app.models.monitored_asset import MonitoredAsset
from app.models.panel import Panel
from app.models.system import System
from app.schemas.panel import PanelRead
from app.schemas.system import SystemRead
from app.services.telemetry import telemetry_bridge


def _mapped(column_a, column_b=None):
    conditions = [(column_a.isnot(None)) & (column_a != "")]
    if column_b is not None:
        conditions.append((column_b.isnot(None)) & (column_b != ""))
    return or_(*conditions)


def live_locations(db: Session, live_device_ids: set[str] | None = None) -> tuple[set[str], set[str]]:
    """(system IDs, panel IDs) holding at least one still-mapped device that reported recently."""
    if live_device_ids is None:
        live_device_ids = telemetry_bridge.live_device_ids(settings.telemetry_offline_after_minutes * 60)
    if not live_device_ids:
        return set(), set()
    ids = list(live_device_ids)
    systems: set[str] = set()
    panels: set[str] = set()
    for model in (Generator, ATS):
        rows = (
            db.query(Panel.system_id, Panel.id)
            .join(model, model.panel_id == Panel.id)
            .filter(model.id.in_(ids), _mapped(model.mqtt_topic, model.power_mqtt_topic))
            .all()
        )
        for system_id, panel_id in rows:
            systems.add(system_id)
            panels.add(panel_id)
    rows = (
        db.query(MonitoredAsset.system_id, MonitoredAsset.panel_id)
        .filter(MonitoredAsset.id.in_(ids), _mapped(MonitoredAsset.mqtt_topic))
        .all()
    )
    for system_id, panel_id in rows:
        systems.add(system_id)
        if panel_id:
            panels.add(panel_id)
    return systems, panels


def live_system_ids(db: Session, live_device_ids: set[str] | None = None) -> set[str]:
    return live_locations(db, live_device_ids)[0]


def effective_status(system: System, live_ids: set[str]) -> str:
    if system.id not in live_ids:
        return "offline"
    # Reporting again: a leftover stored "offline" must not hide a live system.
    return "normal" if system.status in (None, "", "offline") else system.status


def present_systems(db: Session, systems: Iterable[System]) -> list[SystemRead]:
    systems = list(systems)
    live_ids = live_system_ids(db) if systems else set()
    return [
        SystemRead.model_validate(system).model_copy(update={"status": effective_status(system, live_ids)})
        for system in systems
    ]


def present_system(db: Session, system: System) -> SystemRead:
    return present_systems(db, [system])[0]


def present_panels(db: Session, panels: Iterable[Panel]) -> list[PanelRead]:
    """Panels are "online" only while one of their mapped devices is reporting."""
    panels = list(panels)
    live_panels = live_locations(db)[1] if panels else set()
    return [
        PanelRead.model_validate(panel).model_copy(
            update={"connection_status": "online" if panel.id in live_panels else "offline"}
        )
        for panel in panels
    ]


def present_panel(db: Session, panel: Panel) -> PanelRead:
    return present_panels(db, [panel])[0]
