"""commission the Hassenfeld Center PLC and monitored devices

Revision ID: 0028
Revises: 0027
"""

from alembic import op


revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


SYSTEM_ID = "SYS-0006"
PLC_SERIAL = "00E06230D35A"
TOPIC_ROOT = "00:E0:62:30:D3:5A/DEMO/P01"
ASSET_IDS = {
    "GEN-HAS": "HASSET-GEN-0001",
    "ATS-CR": "HASSET-ATS-0001",
    "ATS-EQ1": "HASSET-ATS-0002",
    "ATS-LI": "HASSET-ATS-0003",
}


def upgrade() -> None:
    # Hassenfeld already has the legacy Main Panel used by the system-detail page.
    # Commission that same row as the physical PLC instead of creating a second panel.
    op.execute(
        "UPDATE panels SET "
        "name = 'GEN SWBD Monitoring Panel 1', panel_mqtt_id = 'P01', "
        f"plc_serial = '{PLC_SERIAL}', location = 'Generator Room', "
        "slot_count = 10, sync_status = 'pending' "
        f"WHERE system_id = '{SYSTEM_ID}' AND panel_mqtt_id = 'P01'"
    )

    # Copy the generator nameplate into the commissioning view. G1 carries engine
    # status while the existing M1 topic remains its live electrical/power feed.
    op.execute(
        "INSERT INTO monitored_assets "
        "(id, system_id, panel_id, asset_type, asset_tag, description, manufacturer, model, "
        "serial_number, slot, connection_mode, mqtt_topic, power_topic, controller, rating_amps, "
        "rating_kw, voltage, location, status, created_at, updated_at) "
        f"SELECT '{ASSET_IDS['GEN-HAS']}', p.system_id, p.id, 'generator', g.name, "
        "'Emergency generator', g.make, "
        "g.model, g.serial_number, 'G1', 'plc', "
        f"'{TOPIC_ROOT}/G1', COALESCE(g.mqtt_topic, '{TOPIC_ROOT}/M1'), 'PLC', "
        "g.rated_amps, g.rated_kw, g.rated_volts, 'Generator Room', 'pending', NOW(), NOW() "
        "FROM panels p JOIN generators g ON g.panel_id = p.id "
        f"WHERE p.system_id = '{SYSTEM_ID}' AND p.panel_mqtt_id = 'P01' AND g.name = 'GEN-HAS' "
        "AND NOT EXISTS (SELECT 1 FROM monitored_assets ma "
        "WHERE ma.system_id = p.system_id AND (ma.asset_tag = g.name OR (ma.panel_id = p.id AND ma.slot = 'G1')))"
    )

    # Preserve the ATS ordering shown on Hassenfeld's system detail page.
    for slot, asset_tag in (("A1", "ATS-CR"), ("A2", "ATS-EQ1"), ("A3", "ATS-LI")):
        op.execute(
            "INSERT INTO monitored_assets "
            "(id, system_id, panel_id, asset_type, asset_tag, description, manufacturer, model, "
            "serial_number, slot, connection_mode, mqtt_topic, branch, rating_amps, voltage, "
            "location, status, created_at, updated_at) "
            f"SELECT '{ASSET_IDS[asset_tag]}', p.system_id, p.id, 'ats', a.name, "
            "'Automatic transfer switch', "
            "a.manufacturer, a.model, a.serial_number, "
            f"'{slot}', 'plc', COALESCE(a.mqtt_topic, '{TOPIC_ROOT}/{slot}'), a.branch, "
            "a.rated_amps, a.rated_volts, 'Generator Room', 'pending', NOW(), NOW() "
            "FROM panels p JOIN ats_devices a ON a.panel_id = p.id "
            f"WHERE p.system_id = '{SYSTEM_ID}' AND p.panel_mqtt_id = 'P01' AND a.name = '{asset_tag}' "
            "AND NOT EXISTS (SELECT 1 FROM monitored_assets ma "
            f"WHERE ma.system_id = p.system_id AND (ma.asset_tag = a.name OR (ma.panel_id = p.id AND ma.slot = '{slot}')))"
        )


def downgrade() -> None:
    op.execute(
        "DELETE FROM monitored_assets WHERE id IN "
        "('HASSET-GEN-0001', 'HASSET-ATS-0001', 'HASSET-ATS-0002', 'HASSET-ATS-0003')"
    )
    op.execute(
        "UPDATE panels SET name = 'Main Panel', plc_serial = NULL, location = NULL, "
        "sync_status = 'pending' "
        f"WHERE system_id = '{SYSTEM_ID}' AND panel_mqtt_id = 'P01' AND plc_serial = '{PLC_SERIAL}'"
    )
