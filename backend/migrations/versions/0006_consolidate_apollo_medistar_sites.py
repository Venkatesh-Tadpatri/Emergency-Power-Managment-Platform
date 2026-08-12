"""consolidate Apollo and Medistar systems into one site each

Revision ID: 0006
Revises: 0005
"""
from datetime import datetime
from typing import Sequence, Union
from uuid import uuid4

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _consolidate(bind, customer_name: str, site_name: str) -> None:
    customer = bind.execute(sa.text("SELECT id, address, lat, lng FROM customers WHERE name = :name LIMIT 1"), {"name": customer_name}).mappings().first()
    if not customer:
        return
    now = datetime.utcnow()
    site = bind.execute(sa.text("SELECT id FROM sites WHERE customer_id = :customer_id AND name = :site_name LIMIT 1"), {"customer_id": customer["id"], "site_name": site_name}).mappings().first()
    if site:
        site_id = site["id"]
        bind.execute(sa.text("UPDATE sites SET status = 'active', updated_at = :now WHERE id = :id"), {"id": site_id, "now": now})
    else:
        site_id = str(uuid4())
        bind.execute(sa.text("INSERT INTO sites (id, name, address, lat, lng, customer_id, status, created_at, updated_at) VALUES (:id, :site_name, :address, :lat, :lng, :customer_id, 'active', :now, :now)"), {"id": site_id, "site_name": site_name, "address": customer["address"], "lat": customer["lat"], "lng": customer["lng"], "customer_id": customer["id"], "now": now})
    bind.execute(sa.text("UPDATE systems SET site_id = :site_id WHERE company_id = :customer_id"), {"site_id": site_id, "customer_id": customer["id"]})
    bind.execute(sa.text("UPDATE sites SET status = 'archived', updated_at = :now WHERE customer_id = :customer_id AND id != :site_id"), {"customer_id": customer["id"], "site_id": site_id, "now": now})


def upgrade() -> None:
    bind = op.get_bind()
    _consolidate(bind, "Apollo Hospital", "Apollo Hospital - Hyderabad")
    _consolidate(bind, "Medistar Hospital", "Medistar Hospital - S.R. Nagar")


def downgrade() -> None:
    pass
