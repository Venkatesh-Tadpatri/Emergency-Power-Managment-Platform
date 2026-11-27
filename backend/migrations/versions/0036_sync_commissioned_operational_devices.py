"""sync commissioned ATS and generators into operational device tables

Revision ID: 0036
Revises: 0035
"""

from alembic import op


revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Older Device Administration saves wrote only monitored_assets.  Create the
    # corresponding live device row, preserving the permanent asset ID.  The
    # name/panel guard prevents duplicating seeded systems (such as Hassenfeld),
    # where commissioning and operational rows predate the unified save path.
    op.execute(
        "INSERT INTO generators "
        "(id, name, make, model, serial_number, rated_volts, rated_amps, rated_kw, rated_kva, description, "
        "fuel_type, engine, controller, install_date, location, notes, mqtt_topic, power_mqtt_topic, "
        "panel_id, created_at, updated_at) "
        "SELECT ma.id, ma.asset_tag, ma.manufacturer, ma.model, ma.serial_number, ma.voltage, ma.rating_amps, "
        "ma.rating_kw, ma.rating_kva, ma.description, ma.fuel_type, ma.engine, ma.controller, "
        "ma.install_date, ma.location, ma.notes, ma.mqtt_topic, ma.power_topic, ma.panel_id, NOW(), NOW() "
        "FROM monitored_assets ma "
        "WHERE ma.asset_type = 'generator' AND ma.panel_id IS NOT NULL "
        "AND NOT EXISTS (SELECT 1 FROM generators g WHERE g.id = ma.id OR "
        "(g.panel_id = ma.panel_id AND g.name = ma.asset_tag))"
    )
    op.execute(
        "INSERT INTO ats_devices "
        "(id, name, manufacturer, model, serial_number, branch, source_type, rated_amps, rated_volts, "
        "mqtt_topic, power_mqtt_topic, panel_id, created_at, updated_at) "
        "SELECT ma.id, ma.asset_tag, ma.manufacturer, ma.model, ma.serial_number, "
        "COALESCE(ma.branch, 'equipment'), 'utility', ma.rating_amps, ma.voltage, ma.mqtt_topic, "
        "ma.power_topic, ma.panel_id, NOW(), NOW() FROM monitored_assets ma "
        "WHERE ma.asset_type = 'ats' AND ma.panel_id IS NOT NULL "
        "AND NOT EXISTS (SELECT 1 FROM ats_devices a WHERE a.id = ma.id OR "
        "(a.panel_id = ma.panel_id AND a.name = ma.asset_tag))"
    )


def downgrade() -> None:
    # Only remove rows whose ID is shared with a commissioning record. Seeded
    # legacy equipment uses different IDs and is therefore left untouched.
    op.execute(
        "DELETE FROM generators WHERE id IN "
        "(SELECT id FROM monitored_assets WHERE asset_type = 'generator')"
    )
    op.execute(
        "DELETE FROM ats_devices WHERE id IN "
        "(SELECT id FROM monitored_assets WHERE asset_type = 'ats')"
    )
