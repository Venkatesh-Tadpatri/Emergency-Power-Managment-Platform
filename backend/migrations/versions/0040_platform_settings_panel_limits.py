"""add editable platform settings with per-panel device limits

Revision ID: 0040
Revises: 0039
"""

from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op


revision = "0040"
down_revision = "0039"
branch_labels = None
depends_on = None

DEFAULT_PANEL_LIMITS = {"generator": 1, "ats": 4, "meter": 4, "fuel_tank": 1}


def upgrade() -> None:
    table = op.create_table(
        "platform_settings",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("value", sa.JSON(), nullable=False),
        sa.Column("updated_by", sa.String(255)),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.bulk_insert(
        table,
        [{
            "key": "panel_device_limits",
            "value": DEFAULT_PANEL_LIMITS,
            "updated_by": None,
            "updated_at": datetime.now(timezone.utc).replace(tzinfo=None),
        }],
    )


def downgrade() -> None:
    op.drop_table("platform_settings")
