"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-07-21

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "resellers",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("contact_name", sa.String(255)),
        sa.Column("contact_email", sa.String(255)),
        sa.Column("contact_phone", sa.String(50)),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )

    op.create_table(
        "companies",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("address", sa.String(500)),
        sa.Column("lat", sa.Float),
        sa.Column("lng", sa.Float),
        sa.Column("reseller_id", sa.String(36), sa.ForeignKey("resellers.id"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_companies_reseller_id", "companies", ["reseller_id"])

    op.create_table(
        "systems",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("address", sa.String(500)),
        sa.Column("lat", sa.Float),
        sa.Column("lng", sa.Float),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="normal"),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_systems_company_id", "systems", ["company_id"])

    op.create_table(
        "panels",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("panel_mqtt_id", sa.String(100)),
        sa.Column("system_id", sa.String(36), sa.ForeignKey("systems.id"), nullable=False),
        sa.Column("connection_status", sa.String(20), nullable=False, server_default="unknown"),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_panels_system_id", "panels", ["system_id"])

    op.create_table(
        "ats_devices",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("manufacturer", sa.String(100)),
        sa.Column("model", sa.String(100)),
        sa.Column("serial_number", sa.String(100)),
        sa.Column("branch", sa.String(20), nullable=False, server_default="equipment"),
        sa.Column("rated_amps", sa.Float),
        sa.Column("rated_volts", sa.Float),
        sa.Column("panel_id", sa.String(36), sa.ForeignKey("panels.id"), nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_ats_devices_panel_id", "ats_devices", ["panel_id"])

    op.create_table(
        "generators",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("make", sa.String(100)),
        sa.Column("model", sa.String(100)),
        sa.Column("serial_number", sa.String(100)),
        sa.Column("rated_volts", sa.Float),
        sa.Column("rated_amps", sa.Float),
        sa.Column("rated_kw", sa.Float),
        sa.Column("panel_id", sa.String(36), sa.ForeignKey("panels.id"), nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_generators_panel_id", "generators", ["panel_id"])

    op.create_table(
        "meters",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "ats_id", sa.String(36), sa.ForeignKey("ats_devices.id"), nullable=False, unique=True
        ),
        sa.Column("make", sa.String(100)),
        sa.Column("model", sa.String(100)),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("zitadel_sub", sa.String(255), nullable=False, unique=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(255)),
        sa.Column("role", sa.String(30)),
        sa.Column("scope_type", sa.String(20)),
        sa.Column("reseller_id", sa.String(36), sa.ForeignKey("resellers.id")),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_users_zitadel_sub", "users", ["zitadel_sub"], unique=True)

    op.create_table(
        "user_assigned_systems",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("system_id", sa.String(36), sa.ForeignKey("systems.id"), nullable=False),
    )
    op.create_index("ix_user_assigned_systems_user_id", "user_assigned_systems", ["user_id"])

    op.create_table(
        "alarms",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("system_id", sa.String(36), sa.ForeignKey("systems.id"), nullable=False),
        sa.Column("device_label", sa.String(100)),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("message", sa.String(500), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("occurred_at", sa.DateTime, nullable=False),
        sa.Column("ack_by", sa.String(255)),
        sa.Column("ack_at", sa.DateTime),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_alarms_system_id", "alarms", ["system_id"])

    op.create_table(
        "reports",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("system_id", sa.String(36), sa.ForeignKey("systems.id"), nullable=False),
        sa.Column("report_code", sa.String(100), nullable=False, unique=True),
        sa.Column("type", sa.String(30), nullable=False),
        sa.Column("report_date", sa.Date, nullable=False),
        sa.Column("time_label", sa.String(20)),
        sa.Column("duration_label", sa.String(20)),
        sa.Column("duration_min", sa.Integer),
        sa.Column("initiating_ats", sa.String(100)),
        sa.Column("rated_kw", sa.Integer),
        sa.Column("peak_kw", sa.Integer),
        sa.Column("avg_kw", sa.Integer),
        sa.Column("load_profile_data", sa.JSON),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_reports_company_id", "reports", ["company_id"])
    op.create_index("ix_reports_system_id", "reports", ["system_id"])

    op.create_table(
        "oncall_shifts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("shift_date", sa.Date, nullable=False),
        sa.Column("day_label", sa.String(10), nullable=False),
        sa.Column("primary_name", sa.String(255), nullable=False),
        sa.Column("secondary_name", sa.String(255)),
        sa.Column("shift_label", sa.String(20), nullable=False, server_default="24h"),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_oncall_shifts_company_id", "oncall_shifts", ["company_id"])

    op.create_table(
        "alert_schedules",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )

    op.create_table(
        "alert_rules",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column(
            "alert_schedule_id",
            sa.String(36),
            sa.ForeignKey("alert_schedules.id"),
            nullable=False,
        ),
        sa.Column("condition", sa.String(500)),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )


def downgrade() -> None:
    op.drop_table("alert_rules")
    op.drop_table("alert_schedules")
    op.drop_table("oncall_shifts")
    op.drop_table("reports")
    op.drop_table("alarms")
    op.drop_table("user_assigned_systems")
    op.drop_table("users")
    op.drop_table("meters")
    op.drop_table("generators")
    op.drop_table("ats_devices")
    op.drop_table("panels")
    op.drop_table("systems")
    op.drop_table("companies")
    op.drop_table("resellers")
