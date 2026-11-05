"""add customer primary contact fields

Revision ID: 0030
Revises: 0029
"""

from alembic import op
import sqlalchemy as sa


revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("customers", sa.Column("contact_name", sa.String(255)))
    op.add_column("customers", sa.Column("contact_email", sa.String(255)))
    op.add_column("customers", sa.Column("contact_phone", sa.String(50)))


def downgrade() -> None:
    op.drop_column("customers", "contact_phone")
    op.drop_column("customers", "contact_email")
    op.drop_column("customers", "contact_name")
