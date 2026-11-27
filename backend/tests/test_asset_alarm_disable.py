from datetime import timedelta

import pytest
from fastapi import HTTPException

from app.models.asset_alarm_disable import AssetAlarmDisable
from app.models.system import SystemEvent
from app.routers.equipment_notes import list_equipment_notes
from app.routers.systems import clear_asset_alarm_disable, list_asset_alarm_disables, set_asset_alarm_disable
from app.schemas.system import AssetAlarmDisableRequest
from tests.test_equipment_notes import make_users
from tests.test_operational_device_sync import make_db

KEY = "Plant:generator:GEN-0001"


def disable(db, system, user, duration="4h", reason="Load bank testing"):
    request = AssetAlarmDisableRequest(record_key=KEY, asset_name="GEN-1", duration=duration, reason=reason)
    return set_asset_alarm_disable(system.id, request, db, user)


def test_disable_shows_badge_data_and_writes_event_and_note():
    db, system, _panel = make_db()
    users = make_users(db, system)
    result = disable(db, system, users["system_operator"])

    assert result["disabled"] is True and result["indefinite"] is False
    assert result["disabled_until"] is not None
    listing = list_asset_alarm_disables(system.id, db, users["system_viewer"])
    assert listing["can_control"] is False
    assert [item["record_key"] for item in listing["disables"]] == [KEY]

    events = db.query(SystemEvent).filter(SystemEvent.event_type == "asset_alarms_disabled").all()
    assert len(events) == 1 and "GEN-1" in events[0].message and events[0].reason == "Load bank testing"
    notes = list_equipment_notes(system.id, KEY, db, users["superadmin"])
    assert len(notes) == 1 and notes[0].text.startswith("Alarms disabled for GEN-1 by Operator")


def test_manual_re_enable_clears_and_records_note():
    db, system, _panel = make_db()
    users = make_users(db, system)
    disable(db, system, users["company_admin"], duration="indefinite")
    clear_asset_alarm_disable(system.id, KEY, db, users["company_admin"])

    assert list_asset_alarm_disables(system.id, db, users["company_admin"])["disables"] == []
    notes = list_equipment_notes(system.id, KEY, db, users["company_admin"])
    assert [note.text.split(" for ")[0] for note in notes] == ["Alarms disabled", "Alarms re-enabled"]
    assert db.query(SystemEvent).filter(SystemEvent.event_type == "asset_alarms_enabled").count() == 1


def test_expired_disable_re_enables_automatically():
    db, system, _panel = make_db()
    users = make_users(db, system)
    disable(db, system, users["superadmin"], duration="1h")
    row = db.query(AssetAlarmDisable).one()
    row.disabled_until = row.disabled_at - timedelta(minutes=1)
    db.commit()

    assert list_asset_alarm_disables(system.id, db, users["superadmin"])["disables"] == []
    notes = list_equipment_notes(system.id, KEY, db, users["superadmin"])
    assert notes[-1].text == "Alarms re-enabled for GEN-1 automatically after the disable period ended."
    assert notes[-1].author_name == "System"


def test_viewer_cannot_disable_or_re_enable():
    db, system, _panel = make_db()
    users = make_users(db, system)
    with pytest.raises(HTTPException) as error:
        disable(db, system, users["system_viewer"])
    assert error.value.status_code == 403
    disable(db, system, users["superadmin"])
    with pytest.raises(HTTPException) as error:
        clear_asset_alarm_disable(system.id, KEY, db, users["system_viewer"])
    assert error.value.status_code == 403


def test_reason_is_required():
    with pytest.raises(ValueError):
        AssetAlarmDisableRequest(record_key=KEY, asset_name="GEN-1", duration="1h", reason="")
