"""expand logo storage for uploaded images

Revision ID: 0033
Revises: 0032
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("resellers", "logo_data", existing_type=sa.Text(), type_=mysql.MEDIUMTEXT(), existing_nullable=True)
    op.alter_column("customers", "logo_data", existing_type=sa.Text(), type_=mysql.MEDIUMTEXT(), existing_nullable=True)


def downgrade() -> None:
    op.alter_column("customers", "logo_data", existing_type=mysql.MEDIUMTEXT(), type_=sa.Text(), existing_nullable=True)
    op.alter_column("resellers", "logo_data", existing_type=mysql.MEDIUMTEXT(), type_=sa.Text(), existing_nullable=True)
