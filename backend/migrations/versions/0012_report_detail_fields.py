"""add generator-run and ats-transfer detail fields to reports

Revision ID: 0012
Revises: 0011
"""

import sqlalchemy as sa
from alembic import op


revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Generator Run Report fields — a snapshot of the generator's own nameplate data at report time
    # (not a live lookup against the generators table, so the report still reads correctly even if the
    # unit's config changes later), plus the per-sample telemetry log the report table is built from.
    op.add_column("reports", sa.Column("make", sa.String(100), nullable=True))
    op.add_column("reports", sa.Column("model", sa.String(100), nullable=True))
    op.add_column("reports", sa.Column("serial_number", sa.String(100), nullable=True))
    op.add_column("reports", sa.Column("rated_voltage", sa.Integer(), nullable=True))
    op.add_column("reports", sa.Column("rated_amperage", sa.Integer(), nullable=True))
    op.add_column("reports", sa.Column("start_hours", sa.Float(), nullable=True))
    op.add_column("reports", sa.Column("end_hours", sa.Float(), nullable=True))
    op.add_column("reports", sa.Column("telemetry_log", sa.JSON(), nullable=True))
    # ATS Transfer Report fields.
    op.add_column("reports", sa.Column("event_type", sa.String(30), nullable=True))
    op.add_column("reports", sa.Column("ats_details", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("reports", "ats_details")
    op.drop_column("reports", "event_type")
    op.drop_column("reports", "telemetry_log")
    op.drop_column("reports", "end_hours")
    op.drop_column("reports", "start_hours")
    op.drop_column("reports", "rated_amperage")
    op.drop_column("reports", "rated_voltage")
    op.drop_column("reports", "serial_number")
    op.drop_column("reports", "model")
    op.drop_column("reports", "make")
