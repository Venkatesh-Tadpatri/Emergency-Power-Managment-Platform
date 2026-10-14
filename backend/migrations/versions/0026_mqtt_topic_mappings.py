"""system-scoped MQTT topic registry

Revision ID: 0026
Revises: 0025
"""
from alembic import op
import sqlalchemy as sa

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mqtt_topic_mappings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("system_id", sa.String(36), sa.ForeignKey("systems.id"), nullable=False),
        sa.Column("panel_id", sa.String(36), sa.ForeignKey("panels.id"), nullable=False),
        sa.Column("device_type", sa.String(20), nullable=False),
        sa.Column("device_id", sa.String(36), nullable=False),
        sa.Column("base_topic", sa.String(512), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("base_topic", name="uq_mqtt_topic_mappings_base_topic"),
        sa.UniqueConstraint("device_type", "device_id", name="uq_mqtt_topic_mappings_device"),
    )
    op.create_index("ix_mqtt_topic_mappings_system_id", "mqtt_topic_mappings", ["system_id"])
    op.create_index("ix_mqtt_topic_mappings_panel_id", "mqtt_topic_mappings", ["panel_id"])
    op.create_index("ix_mqtt_topic_mappings_device_id", "mqtt_topic_mappings", ["device_id"])

    # Preserve existing configuration while moving lookup responsibility into the registry.
    op.execute("""
        INSERT INTO mqtt_topic_mappings
            (id, system_id, panel_id, device_type, device_id, base_topic, enabled, created_at, updated_at)
        SELECT CONCAT('MQT-G-', g.id), p.system_id, g.panel_id, 'generator', g.id,
               TRIM(BOTH '/' FROM g.mqtt_topic), 1, NOW(), NOW()
        FROM generators g JOIN panels p ON p.id = g.panel_id
        WHERE g.mqtt_topic IS NOT NULL AND TRIM(g.mqtt_topic) <> ''
    """)
    op.execute("""
        INSERT INTO mqtt_topic_mappings
            (id, system_id, panel_id, device_type, device_id, base_topic, enabled, created_at, updated_at)
        SELECT CONCAT('MQT-A-', a.id), p.system_id, a.panel_id, 'ats', a.id,
               TRIM(BOTH '/' FROM a.mqtt_topic), 1, NOW(), NOW()
        FROM ats_devices a JOIN panels p ON p.id = a.panel_id
        WHERE a.mqtt_topic IS NOT NULL AND TRIM(a.mqtt_topic) <> ''
    """)


def downgrade() -> None:
    op.drop_table("mqtt_topic_mappings")
