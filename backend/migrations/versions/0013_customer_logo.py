"""add customer logo for branded reports

Revision ID: 0013
Revises: 0012
"""

import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("customers", sa.Column("logo_data", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("customers", "logo_data")
