"""add site-level operator assignments

Revision ID: 0008
Revises: 0007
"""

import sqlalchemy as sa
from alembic import op


revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_assigned_sites",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("site_id", sa.String(36), sa.ForeignKey("sites.id"), nullable=False),
    )
    op.create_index("ix_user_assigned_sites_user_id", "user_assigned_sites", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_user_assigned_sites_user_id", table_name="user_assigned_sites")
    op.drop_table("user_assigned_sites")
