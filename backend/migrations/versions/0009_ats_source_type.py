"""add source_type to ats_devices

Revision ID: 0009
Revises: 0008
"""

import sqlalchemy as sa
from alembic import op


revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ats_devices",
        sa.Column("source_type", sa.String(20), nullable=False, server_default="utility"),
    )


def downgrade() -> None:
    op.drop_column("ats_devices", "source_type")
