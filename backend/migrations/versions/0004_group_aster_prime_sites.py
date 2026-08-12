"""group legacy Aster Prime systems into its Ameerpet site

Revision ID: 0004
Revises: 0003
"""
from datetime import datetime
from typing import Sequence, Union
from uuid import uuid4

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Preserve legacy records while grouping Aster Prime into one real site."""
    bind = op.get_bind()
    customer = bind.execute(sa.text("SELECT id, address, lat, lng FROM customers WHERE name = 'Aster Prime' LIMIT 1")).mappings().first()
    if not customer:
        return

    systems = bind.execute(sa.text("SELECT id FROM systems WHERE company_id = :customer_id ORDER BY name"), {"customer_id": customer["id"]}).mappings().all()
    if not systems:
        return

    names = ("Aster Prime - Ameerpet",)
    site_ids: list[str] = []
    now = datetime.utcnow()
    for name in names:
        existing = bind.execute(sa.text("SELECT id FROM sites WHERE customer_id = :customer_id AND name = :name LIMIT 1"), {"customer_id": customer["id"], "name": name}).mappings().first()
        if existing:
            site_ids.append(existing["id"])
            continue
        site_id = str(uuid4())
        bind.execute(sa.text("INSERT INTO sites (id, name, address, lat, lng, customer_id, status, created_at, updated_at) VALUES (:id, :name, :address, :lat, :lng, :customer_id, 'active', :now, :now)"), {"id": site_id, "name": name, "address": customer["address"], "lat": customer["lat"], "lng": customer["lng"], "customer_id": customer["id"], "now": now})
        site_ids.append(site_id)

    for index, system in enumerate(systems):
        bind.execute(sa.text("UPDATE systems SET site_id = :site_id WHERE id = :system_id"), {"site_id": site_ids[index % len(site_ids)], "system_id": system["id"]})

    # Legacy one-system sites are retained for auditability but hidden from the UI.
    bind.execute(sa.text("UPDATE sites SET status = 'archived', updated_at = :now WHERE customer_id = :customer_id AND id NOT IN (:site_ids)" ).bindparams(sa.bindparam("site_ids", expanding=True)), {"customer_id": customer["id"], "site_ids": site_ids, "now": now})


def downgrade() -> None:
    # Do not undo data grouping automatically; the original site records remain archived.
    pass
