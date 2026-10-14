"""generator-specific monitored asset fields

Revision ID: 0020
Revises: 0019
"""
from alembic import op
import sqlalchemy as sa

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("monitored_assets", sa.Column("power_topic", sa.String(512)))
    op.add_column("monitored_assets", sa.Column("controller", sa.String(100)))
    op.add_column("monitored_assets", sa.Column("rating_kw", sa.Float()))
    op.add_column("monitored_assets", sa.Column("rating_kva", sa.Float()))
    op.add_column("monitored_assets", sa.Column("fuel_type", sa.String(30)))
    op.add_column("monitored_assets", sa.Column("engine", sa.String(100)))


def downgrade() -> None:
    for column in ("engine", "fuel_type", "rating_kva", "rating_kw", "controller", "power_topic"):
        op.drop_column("monitored_assets", column)
