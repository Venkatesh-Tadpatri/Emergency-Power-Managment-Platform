"""add system alarm-disable state and audit events

Revision ID: 0031
Revises: 0030
"""

from alembic import op
import sqlalchemy as sa


revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("systems", sa.Column("alarms_disabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("systems", sa.Column("alarms_disabled_at", sa.DateTime()))
    op.add_column("systems", sa.Column("alarms_disabled_until", sa.DateTime()))
    op.add_column("systems", sa.Column("alarms_disabled_indefinitely", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("systems", sa.Column("alarms_disabled_reason", sa.Text()))
    op.add_column("systems", sa.Column("alarms_disabled_by_user_id", sa.String(36)))
    op.add_column("systems", sa.Column("alarms_disabled_by_name", sa.String(255)))
    op.add_column("systems", sa.Column("alarms_disabled_by_email", sa.String(255)))
    op.add_column("systems", sa.Column("alarms_reminder_sent_at", sa.DateTime()))
    op.create_foreign_key("fk_systems_alarm_disabled_by", "systems", "users", ["alarms_disabled_by_user_id"], ["id"])
    op.create_table(
        "system_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("system_id", sa.String(36), sa.ForeignKey("systems.id"), nullable=False),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("message", sa.String(1000), nullable=False),
        sa.Column("occurred_at", sa.DateTime(), nullable=False),
        sa.Column("actor_user_id", sa.String(36), sa.ForeignKey("users.id")),
        sa.Column("actor_name", sa.String(255)),
        sa.Column("reason", sa.Text()),
    )
    op.create_index("ix_system_events_system_id", "system_events", ["system_id"])
    bind = op.get_bind()
    if bind.dialect.name == "mysql":
        op.execute("INSERT INTO id_sequences (prefix, next_value) VALUES ('EVT', 1) ON DUPLICATE KEY UPDATE prefix = prefix")
    else:
        op.execute("INSERT OR IGNORE INTO id_sequences (prefix, next_value) VALUES ('EVT', 1)")


def downgrade() -> None:
    op.drop_index("ix_system_events_system_id", table_name="system_events")
    op.drop_table("system_events")
    op.drop_constraint("fk_systems_alarm_disabled_by", "systems", type_="foreignkey")
    for column in (
        "alarms_reminder_sent_at", "alarms_disabled_by_email", "alarms_disabled_by_name",
        "alarms_disabled_by_user_id", "alarms_disabled_reason", "alarms_disabled_indefinitely",
        "alarms_disabled_until", "alarms_disabled_at", "alarms_disabled",
    ):
        op.drop_column("systems", column)
