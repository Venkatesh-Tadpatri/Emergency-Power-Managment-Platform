"""breaker-specific monitored asset fields

Revision ID: 0022
Revises: 0021
"""
from alembic import op
import sqlalchemy as sa

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("monitored_assets", sa.Column("trip_amps", sa.Float()))
    op.add_column("monitored_assets", sa.Column("interrupting_ka", sa.Float()))
    op.add_column("monitored_assets", sa.Column("trip_unit", sa.String(100)))
    op.add_column("monitored_assets", sa.Column("fed_from", sa.String(100)))
    op.add_column("monitored_assets", sa.Column("feeds", sa.String(100)))


def downgrade() -> None:
    for column in ("feeds", "fed_from", "trip_unit", "interrupting_ka", "trip_amps"):
        op.drop_column("monitored_assets", column)
