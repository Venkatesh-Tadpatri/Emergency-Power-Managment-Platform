import pytest
from fastapi import HTTPException

from app.models.ats import ATS
from app.models.generator import Generator
from app.models.monitored_asset import MonitoredAsset
from app.services.panel_limits import DEFAULT_LIMITS, enforce_panel_limit, get_limits, save_limits, usage_max
from tests.test_operational_device_sync import make_db


def test_defaults_apply_until_limits_are_saved():
    db, _system, _panel = make_db()
    assert get_limits(db) == DEFAULT_LIMITS


def test_saved_limits_are_read_back():
    db, _system, _panel = make_db()
    save_limits(db, {"generator": 2, "ats": 6, "meter": 3, "fuel_tank": 1}, "admin@example.com")
    assert get_limits(db) == {"generator": 2, "ats": 6, "meter": 3, "fuel_tank": 1}
    save_limits(db, {"generator": 1, "ats": 4, "meter": 4, "fuel_tank": 1}, "admin@example.com")
    assert get_limits(db)["ats"] == 4


def test_generator_limit_blocks_second_generator_until_raised():
    db, _system, panel = make_db()
    db.add(Generator(panel_id=panel.id, name="GEN-1"))
    db.flush()
    with pytest.raises(HTTPException) as error:
        enforce_panel_limit(db, panel.id, "generator")
    assert error.value.status_code == 409

    save_limits(db, {**DEFAULT_LIMITS, "generator": 2}, None)
    enforce_panel_limit(db, panel.id, "generator", slot="G2")  # now allowed


def test_slot_outside_configured_range_is_rejected():
    db, _system, panel = make_db()
    with pytest.raises(HTTPException):
        enforce_panel_limit(db, panel.id, "ats", slot="A5")  # default ATS limit is 4
    enforce_panel_limit(db, panel.id, "ats", slot="A4")
    with pytest.raises(HTTPException):
        enforce_panel_limit(db, panel.id, "meter", slot="A1")  # wrong prefix for a meter


def test_meter_limit_counts_monitored_assets_and_excludes_the_one_being_edited():
    db, system, panel = make_db()
    save_limits(db, {**DEFAULT_LIMITS, "meter": 2}, None)
    meters = []
    for index in (1, 2):
        meter = MonitoredAsset(system_id=system.id, panel_id=panel.id, asset_type="meter", asset_tag=f"M-{index}", slot=f"M{index}", connection_mode="plc", status="pending")
        db.add(meter)
        meters.append(meter)
    db.flush()
    with pytest.raises(HTTPException):
        enforce_panel_limit(db, panel.id, "meter")
    # Moving an existing meter within the full panel is still allowed.
    enforce_panel_limit(db, panel.id, "meter", exclude_id=meters[0].id, slot="M1")


def test_usage_max_reports_the_fullest_panel():
    db, _system, panel = make_db()
    for index in range(5):
        db.add(ATS(panel_id=panel.id, name=f"ATS-{index}", branch="equipment", source_type="utility"))
    db.flush()
    assert usage_max(db)["ats"] == 5
