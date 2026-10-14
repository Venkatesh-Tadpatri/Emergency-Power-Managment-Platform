"""fuel-tank-specific monitored asset fields

Revision ID: 0024
Revises: 0023
"""
from alembic import op
import sqlalchemy as sa

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("monitored_assets", sa.Column("tank_read_mode", sa.String(30)))
    op.add_column("monitored_assets", sa.Column("served_generator_ids", sa.JSON()))
    op.add_column("monitored_assets", sa.Column("capacity_gal", sa.Float()))
    op.add_column("monitored_assets", sa.Column("tank_type", sa.String(50)))
    op.add_column("monitored_assets", sa.Column("construction", sa.String(100)))
    op.add_column("monitored_assets", sa.Column("low_level_percent", sa.Float()))
    op.add_column("monitored_assets", sa.Column("runtime_hours", sa.Float()))


def downgrade() -> None:
    for column in ("runtime_hours", "low_level_percent", "construction", "tank_type", "capacity_gal", "served_generator_ids", "tank_read_mode"):
        op.drop_column("monitored_assets", column)
