"""separate ATS meter power topic

Revision ID: 0027
Revises: 0026
"""
from alembic import op
import sqlalchemy as sa

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ats_devices", sa.Column("power_mqtt_topic", sa.String(512)))
    op.create_index("ix_ats_devices_power_mqtt_topic", "ats_devices", ["power_mqtt_topic"])


def downgrade() -> None:
    op.drop_index("ix_ats_devices_power_mqtt_topic", table_name="ats_devices")
    op.drop_column("ats_devices", "power_mqtt_topic")
