"""PLC commissioning and monitored assets

Revision ID: 0019
Revises: 0018
"""
from alembic import op
import sqlalchemy as sa

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("panels", sa.Column("plc_serial", sa.String(100)))
    op.add_column("panels", sa.Column("location", sa.String(255)))
    op.add_column("panels", sa.Column("slot_count", sa.Integer(), nullable=False, server_default="10"))
    op.add_column("panels", sa.Column("sync_status", sa.String(20), nullable=False, server_default="pending"))
    op.create_table("monitored_assets",
        sa.Column("id", sa.String(36), primary_key=True), sa.Column("system_id", sa.String(36), sa.ForeignKey("systems.id"), nullable=False),
        sa.Column("panel_id", sa.String(36), sa.ForeignKey("panels.id")), sa.Column("asset_type", sa.String(30), nullable=False), sa.Column("asset_tag", sa.String(100), nullable=False),
        sa.Column("description", sa.String(255)), sa.Column("manufacturer", sa.String(100)), sa.Column("model", sa.String(100)), sa.Column("serial_number", sa.String(100)),
        sa.Column("install_date", sa.Date()), sa.Column("location", sa.String(255)), sa.Column("slot", sa.String(10)), sa.Column("connection_mode", sa.String(20), nullable=False, server_default="plc"),
        sa.Column("mqtt_topic", sa.String(512)), sa.Column("command_topic", sa.String(512)), sa.Column("branch", sa.String(30)), sa.Column("rating_amps", sa.Float()),
        sa.Column("voltage", sa.Float()), sa.Column("poles", sa.String(20)), sa.Column("transition_type", sa.String(30)), sa.Column("linked_asset_id", sa.String(36)),
        sa.Column("notes", sa.Text()), sa.Column("status", sa.String(20), nullable=False, server_default="pending"), sa.Column("created_at", sa.DateTime(), nullable=False), sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("system_id", "asset_tag", name="uq_monitored_asset_tag"), sa.UniqueConstraint("panel_id", "slot", name="uq_panel_slot"))
    op.create_index("ix_monitored_assets_system_id", "monitored_assets", ["system_id"])
    op.create_index("ix_monitored_assets_panel_id", "monitored_assets", ["panel_id"])
    op.create_table("panel_pushes", sa.Column("id", sa.String(36), primary_key=True), sa.Column("panel_id", sa.String(36), sa.ForeignKey("panels.id"), nullable=False), sa.Column("pushed_at", sa.DateTime(), nullable=False), sa.Column("pushed_by", sa.String(255)), sa.Column("summary", sa.String(500), nullable=False), sa.Column("status", sa.String(20), nullable=False, server_default="confirmed"))


def downgrade():
    op.drop_table("panel_pushes"); op.drop_table("monitored_assets")
    for name in ("sync_status", "slot_count", "location", "plc_serial"): op.drop_column("panels", name)
