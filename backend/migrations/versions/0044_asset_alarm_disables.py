"""per-asset alarm disable

Revision ID: 0044
Revises: 0043
"""

import sqlalchemy as sa
from alembic import op


revision = "0044"
down_revision = "0043"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "asset_alarm_disables",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("system_id", sa.String(36), sa.ForeignKey("systems.id"), nullable=False),
        sa.Column("record_key", sa.String(255), nullable=False),
        sa.Column("asset_name", sa.String(255), nullable=False),
        sa.Column("disabled_at", sa.DateTime(), nullable=False),
        sa.Column("disabled_until", sa.DateTime()),
        sa.Column("indefinite", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("disabled_by_user_id", sa.String(36)),
        sa.Column("disabled_by_name", sa.String(255)),
        sa.Column("disabled_by_email", sa.String(255)),
        sa.Column("reminder_sent_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("system_id", "record_key", name="uq_asset_alarm_disables_system_record"),
    )
    op.create_index("ix_asset_alarm_disables_system_id", "asset_alarm_disables", ["system_id"])


def downgrade() -> None:
    op.drop_index("ix_asset_alarm_disables_system_id", table_name="asset_alarm_disables")
    op.drop_table("asset_alarm_disables")
