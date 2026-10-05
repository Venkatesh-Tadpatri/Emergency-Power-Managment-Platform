"""add MQTT topic addresses to ATS and generator devices

Revision ID: 0017
Revises: 0016
"""

from alembic import op
import sqlalchemy as sa


revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ats_devices", sa.Column("mqtt_topic", sa.String(length=512), nullable=True))
    op.create_index("ix_ats_devices_mqtt_topic", "ats_devices", ["mqtt_topic"])
    op.add_column("generators", sa.Column("mqtt_topic", sa.String(length=512), nullable=True))
    op.create_index("ix_generators_mqtt_topic", "generators", ["mqtt_topic"])


def downgrade() -> None:
    op.drop_index("ix_generators_mqtt_topic", table_name="generators")
    op.drop_column("generators", "mqtt_topic")
    op.drop_index("ix_ats_devices_mqtt_topic", table_name="ats_devices")
    op.drop_column("ats_devices", "mqtt_topic")
