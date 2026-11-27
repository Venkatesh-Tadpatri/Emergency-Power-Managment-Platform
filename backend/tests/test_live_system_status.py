from datetime import datetime, timedelta, timezone

from app.models.generator import Generator
from app.models.panel import Panel
from app.models.system import System
from app.services import system_status
from app.services.telemetry import DeviceMatch, TelemetryBridge
from tests.test_operational_device_sync import make_db


def add_generator(db, panel, topic):
    generator = Generator(name="GEN", panel_id=panel.id, mqtt_topic=topic)
    db.add(generator)
    db.flush()
    return generator


def second_system(db, system):
    other = System(name="Other", company_id=system.company_id, site_id=system.site_id, status="normal")
    db.add(other)
    db.flush()
    panel = Panel(name="Other panel", system_id=other.id, connection_status="online")
    db.add(panel)
    db.flush()
    return other, panel


def test_only_systems_with_a_reporting_mapped_device_are_online(monkeypatch):
    db, system, panel = make_db()
    other, other_panel = second_system(db, system)
    live = add_generator(db, panel, "TSTP03/M4")
    add_generator(db, other_panel, "")  # no MQTT address mapped
    monkeypatch.setattr(system_status.telemetry_bridge, "live_device_ids", lambda _age: {live.id})

    systems = {item.id: item.status for item in system_status.present_systems(db, [system, other])}
    assert systems == {system.id: "normal", other.id: "offline"}

    panels = {item.id: item.connection_status for item in system_status.present_panels(db, [panel, other_panel])}
    assert panels == {panel.id: "online", other_panel.id: "offline"}


def test_stored_offline_does_not_hide_a_live_system_and_alarm_state_is_kept(monkeypatch):
    db, system, panel = make_db()
    live = add_generator(db, panel, "TSTP03/M4")
    monkeypatch.setattr(system_status.telemetry_bridge, "live_device_ids", lambda _age: {live.id})
    system.status = "offline"
    assert system_status.present_system(db, system).status == "normal"
    system.status = "alarm"
    assert system_status.present_system(db, system).status == "alarm"


def test_unmapping_a_device_takes_the_system_offline(monkeypatch):
    db, system, panel = make_db()
    live = add_generator(db, panel, "TSTP03/M4")
    monkeypatch.setattr(system_status.telemetry_bridge, "live_device_ids", lambda _age: {live.id})
    live.mqtt_topic = None
    db.flush()
    assert system_status.present_system(db, system).status == "offline"


def test_bridge_reports_only_recent_devices_while_connected():
    bridge = TelemetryBridge()
    match = DeviceMatch("generator", "GEN-1", "GEN", "T", "SYS", "CUS", "SITE", "PNL")
    stale = DeviceMatch("generator", "GEN-2", "GEN", "T", "SYS", "CUS", "SITE", "PNL")
    now = datetime.now(timezone.utc)
    bridge._latest = {("generator", "GEN-1"): (match, "T", {"x": 1}), ("generator", "GEN-2"): (stale, "T", {"x": 1})}
    bridge._latest_received_at = {("generator", "GEN-1"): now, ("generator", "GEN-2"): now - timedelta(hours=2)}
    assert bridge.live_device_ids(1800) == set()  # broker not connected
    bridge.connected = True
    assert bridge.live_device_ids(1800) == {"GEN-1"}
