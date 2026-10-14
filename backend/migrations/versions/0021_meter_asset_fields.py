"""meter-specific monitored asset fields

Revision ID: 0021
Revises: 0020
"""
from alembic import op
import sqlalchemy as sa

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("monitored_assets", sa.Column("meter_model", sa.String(100)))
    op.add_column("monitored_assets", sa.Column("measured_asset_id", sa.String(36)))
    op.add_column("monitored_assets", sa.Column("measures", sa.String(255)))
    op.add_column("monitored_assets", sa.Column("ct_ratio", sa.String(30)))
    op.add_column("monitored_assets", sa.Column("pt_ratio", sa.String(30)))
    op.add_column("monitored_assets", sa.Column("voltage_label", sa.String(30)))


def downgrade() -> None:
    for column in ("voltage_label", "pt_ratio", "ct_ratio", "measures", "measured_asset_id", "meter_model"):
        op.drop_column("monitored_assets", column)
