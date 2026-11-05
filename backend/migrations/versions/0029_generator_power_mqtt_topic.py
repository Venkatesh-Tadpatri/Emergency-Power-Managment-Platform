"""separate generator meter power topic

Revision ID: 0029
Revises: 0028
"""

from alembic import op
import sqlalchemy as sa


revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("generators", sa.Column("power_mqtt_topic", sa.String(512)))
    op.create_index("ix_generators_power_mqtt_topic", "generators", ["power_mqtt_topic"])


def downgrade() -> None:
    op.drop_index("ix_generators_power_mqtt_topic", table_name="generators")
    op.drop_column("generators", "power_mqtt_topic")
