"""expand generator details

Revision ID: 0035
Revises: 0034
"""

from alembic import op
import sqlalchemy as sa


revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("generators", sa.Column("rated_kva", sa.Float(), nullable=True))
    op.add_column("generators", sa.Column("description", sa.String(length=500), nullable=True))
    op.add_column("generators", sa.Column("fuel_type", sa.String(length=50), nullable=True))
    op.add_column("generators", sa.Column("engine", sa.String(length=255), nullable=True))
    op.add_column("generators", sa.Column("controller", sa.String(length=100), nullable=True))
    op.add_column("generators", sa.Column("install_date", sa.Date(), nullable=True))
    op.add_column("generators", sa.Column("location", sa.String(length=255), nullable=True))
    op.add_column("generators", sa.Column("notes", sa.Text(), nullable=True))


def downgrade() -> None:
    for column in ("notes", "location", "install_date", "controller", "engine", "fuel_type", "description", "rated_kva"):
        op.drop_column("generators", column)
