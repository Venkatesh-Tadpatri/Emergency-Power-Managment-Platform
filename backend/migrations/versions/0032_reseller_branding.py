"""add reseller branding

Revision ID: 0032
Revises: 0031
"""

from alembic import op
import sqlalchemy as sa


revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("resellers", sa.Column("logo_data", sa.Text()))
    op.add_column("resellers", sa.Column("show_logo_on_reports", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("resellers", "show_logo_on_reports")
    op.drop_column("resellers", "logo_data")
