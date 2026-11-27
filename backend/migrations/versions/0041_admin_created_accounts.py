"""admin-created accounts with first-login verification

Revision ID: 0041
Revises: 0040
"""

import sqlalchemy as sa
from alembic import op


revision = "0041"
down_revision = "0040"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("invited_at", sa.DateTime()))
    op.add_column("users", sa.Column("invited_by", sa.String(255)))


def downgrade() -> None:
    op.drop_column("users", "invited_by")
    op.drop_column("users", "invited_at")
