"""shared equipment notes

Revision ID: 0042
Revises: 0041
"""

import sqlalchemy as sa
from alembic import op


revision = "0042"
down_revision = "0041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "equipment_notes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("system_id", sa.String(36), sa.ForeignKey("systems.id"), nullable=False),
        sa.Column("record_key", sa.String(255), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("author_id", sa.String(36)),
        sa.Column("author_name", sa.String(255), nullable=False),
        sa.Column("author_email", sa.String(255)),
        sa.Column("author_role", sa.String(50)),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_equipment_notes_system_id", "equipment_notes", ["system_id"])
    op.create_index("ix_equipment_notes_record_key", "equipment_notes", ["record_key"])
    op.create_index("ix_equipment_notes_author_id", "equipment_notes", ["author_id"])


def downgrade() -> None:
    op.drop_index("ix_equipment_notes_author_id", table_name="equipment_notes")
    op.drop_index("ix_equipment_notes_record_key", table_name="equipment_notes")
    op.drop_index("ix_equipment_notes_system_id", table_name="equipment_notes")
    op.drop_table("equipment_notes")
