"""rename companies to customers and introduce sites

Revision ID: 0003
Revises: 0002
"""
from typing import Sequence, Union
from uuid import uuid4

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # A table rename retains every existing tenant and its relationships.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "companies" in tables:
        op.rename_table("companies", "customers")
        tables.remove("companies")
        tables.add("customers")
    if "sites" not in tables:
        op.create_table(
            "sites",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("address", sa.String(500)),
            sa.Column("lat", sa.Float),
            sa.Column("lng", sa.Float),
            sa.Column("customer_id", sa.String(36), sa.ForeignKey("customers.id"), nullable=False),
            sa.Column("status", sa.String(20), nullable=False, server_default="active"),
            sa.Column("created_at", sa.DateTime, nullable=False),
            sa.Column("updated_at", sa.DateTime, nullable=False),
        )
        op.create_index("ix_sites_customer_id", "sites", ["customer_id"])
    system_columns = {column["name"] for column in inspector.get_columns("systems")}
    if "site_id" not in system_columns:
        op.add_column("systems", sa.Column("site_id", sa.String(36), nullable=True))
        op.create_foreign_key("fk_systems_site_id", "systems", "sites", ["site_id"], ["id"])

    # Existing systems become their own initial site. This avoids losing the
    # distinct location/address data that previously lived on each system.
    rows = bind.execute(sa.text("SELECT id, name, address, lat, lng, company_id, created_at, updated_at FROM systems WHERE site_id IS NULL")).mappings()
    for row in rows:
        site_id = str(uuid4())
        bind.execute(
            sa.text("INSERT INTO sites (id, name, address, lat, lng, customer_id, status, created_at, updated_at) VALUES (:id, :name, :address, :lat, :lng, :customer_id, 'active', :created_at, :updated_at)"),
            {"id": site_id, "name": row["name"], "address": row["address"], "lat": row["lat"], "lng": row["lng"], "customer_id": row["company_id"], "created_at": row["created_at"], "updated_at": row["updated_at"]},
        )
        bind.execute(sa.text("UPDATE systems SET site_id = :site_id WHERE id = :system_id"), {"site_id": site_id, "system_id": row["id"]})
    op.alter_column("systems", "site_id", existing_type=sa.String(36), nullable=False)


def downgrade() -> None:
    op.drop_constraint("fk_systems_site_id", "systems", type_="foreignkey")
    op.drop_column("systems", "site_id")
    op.drop_index("ix_sites_customer_id", table_name="sites")
    op.drop_table("sites")
    op.rename_table("customers", "companies")
