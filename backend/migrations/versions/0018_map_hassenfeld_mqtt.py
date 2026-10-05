"""map the Hassenfeld Center generator to its live MQTT meter topic

Revision ID: 0018
Revises: 0017
"""

from alembic import op


revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None

HASSENFELD_MQTT_TOPIC = "00:E0:62:30:D3:5A/DEMO/P01/M1"


def upgrade() -> None:
    op.execute(
        "UPDATE generators AS g "
        "JOIN panels AS p ON g.panel_id = p.id "
        "JOIN systems AS s ON p.system_id = s.id "
        f"SET g.mqtt_topic = '{HASSENFELD_MQTT_TOPIC}' "
        "WHERE s.id = 'SYS-0006' AND g.name = 'GEN-HAS'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE generators AS g "
        "JOIN panels AS p ON g.panel_id = p.id "
        "JOIN systems AS s ON p.system_id = s.id "
        "SET g.mqtt_topic = NULL "
        f"WHERE s.id = 'SYS-0006' AND g.name = 'GEN-HAS' AND g.mqtt_topic = '{HASSENFELD_MQTT_TOPIC}'"
    )
