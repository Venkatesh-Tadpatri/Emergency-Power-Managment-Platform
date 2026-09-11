"""add system_one_lines table for the One-Line Wizard's saved diagram

Revision ID: 0011
Revises: 0010
"""

import sqlalchemy as sa
from alembic import op


revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "system_one_lines",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("system_id", sa.String(36), sa.ForeignKey("systems.id"), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_index(
        "ix_system_one_lines_system_id", "system_one_lines", ["system_id"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_system_one_lines_system_id", table_name="system_one_lines")
    op.drop_table("system_one_lines")
