"""UPS-specific monitored asset fields

Revision ID: 0023
Revises: 0022
"""
from alembic import op
import sqlalchemy as sa

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("monitored_assets", sa.Column("input_voltage", sa.String(30)))
    op.add_column("monitored_assets", sa.Column("output_voltage", sa.String(30)))
    op.add_column("monitored_assets", sa.Column("topology", sa.String(50)))
    op.add_column("monitored_assets", sa.Column("battery", sa.String(100)))
    op.add_column("monitored_assets", sa.Column("runtime_minutes", sa.Float()))


def downgrade() -> None:
    for column in ("runtime_minutes", "battery", "topology", "output_voltage", "input_voltage"):
        op.drop_column("monitored_assets", column)
