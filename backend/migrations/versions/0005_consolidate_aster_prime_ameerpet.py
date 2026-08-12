"""consolidate Aster Prime systems under Ameerpet

Revision ID: 0005
Revises: 0004
"""
from datetime import datetime
from typing import Sequence, Union
from uuid import uuid4

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    customer = bind.execute(sa.text("SELECT id, address, lat, lng FROM customers WHERE name = 'Aster Prime' LIMIT 1")).mappings().first()
    if not customer:
        return
    now = datetime.utcnow()
    site = bind.execute(sa.text("SELECT id FROM sites WHERE customer_id = :customer_id AND name = 'Aster Prime - Ameerpet' LIMIT 1"), {"customer_id": customer["id"]}).mappings().first()
    if site:
        site_id = site["id"]
        bind.execute(sa.text("UPDATE sites SET status = 'active', updated_at = :now WHERE id = :id"), {"id": site_id, "now": now})
    else:
        site_id = str(uuid4())
        bind.execute(sa.text("INSERT INTO sites (id, name, address, lat, lng, customer_id, status, created_at, updated_at) VALUES (:id, 'Aster Prime - Ameerpet', :address, :lat, :lng, :customer_id, 'active', :now, :now)"), {"id": site_id, "address": customer["address"], "lat": customer["lat"], "lng": customer["lng"], "customer_id": customer["id"], "now": now})
    bind.execute(sa.text("UPDATE systems SET site_id = :site_id WHERE company_id = :customer_id"), {"site_id": site_id, "customer_id": customer["id"]})
    bind.execute(sa.text("UPDATE sites SET status = 'archived', updated_at = :now WHERE customer_id = :customer_id AND id != :site_id"), {"customer_id": customer["id"], "site_id": site_id, "now": now})


def downgrade() -> None:
    pass
