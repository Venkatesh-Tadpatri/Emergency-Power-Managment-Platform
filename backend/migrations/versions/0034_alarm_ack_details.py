"""add alarm acknowledgment comment and clear time

Revision ID: 0034
Revises: 0033
"""

from alembic import op
import sqlalchemy as sa


revision = "0034"
down_revision = "0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("alarms", sa.Column("ack_comment", sa.String(length=1000), nullable=True))
    op.add_column("alarms", sa.Column("cleared_at", sa.DateTime(), nullable=True))
    op.execute("UPDATE alarms SET cleared_at = COALESCE(ack_at, occurred_at) WHERE status = 'cleared'")


def downgrade() -> None:
    op.drop_column("alarms", "cleared_at")
    op.drop_column("alarms", "ack_comment")
