"""fuel tank Modbus gauge model

Revision ID: 0025
Revises: 0024
"""
from alembic import op
import sqlalchemy as sa

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("monitored_assets", sa.Column("tank_gauge_model", sa.String(100)))


def downgrade() -> None:
    op.drop_column("monitored_assets", "tank_gauge_model")
