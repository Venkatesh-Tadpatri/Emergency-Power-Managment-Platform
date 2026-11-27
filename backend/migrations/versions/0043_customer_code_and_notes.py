"""customer code (CUSTCODE) and notes

Revision ID: 0043
Revises: 0042

CUSTCODE used to be recomputed from the customer's current name every time a panel was created, so a
rename silently changed the PNUMBER prefix for new panels. It is now stored once per customer and never
changes. Existing customers are backfilled from the prefix their panels already use (e.g. ASTEP02 ->
ASTE, MEDISTAR-P01 -> MEDISTAR) so new PNUMBERs continue the existing series; customers with no panels
get a code from their name, made unique.
"""

import re
from collections import Counter

import sqlalchemy as sa
from alembic import op


revision = "0043"
down_revision = "0042"
branch_labels = None
depends_on = None

PNUMBER = re.compile(r"^([A-Z0-9]+?)-?P\d+$")


def _name_code(name: str | None, fallback: str) -> str:
    code = "".join(character for character in (name or "") if character.isalnum()).upper()[:4]
    return code or fallback


def upgrade() -> None:
    op.add_column("customers", sa.Column("customer_code", sa.String(12)))
    op.add_column("customers", sa.Column("notes", sa.Text()))
    op.create_index("ix_customers_customer_code", "customers", ["customer_code"])

    bind = op.get_bind()
    customers = bind.execute(sa.text("SELECT id, name FROM customers ORDER BY id")).fetchall()
    panel_rows = bind.execute(sa.text(
        "SELECT s.company_id, p.panel_mqtt_id FROM panels p JOIN systems s ON s.id = p.system_id "
        "WHERE p.panel_mqtt_id IS NOT NULL"
    )).fetchall()
    prefixes: dict[str, Counter] = {}
    for company_id, pnumber in panel_rows:
        match = PNUMBER.match((pnumber or "").strip().upper())
        if match:
            prefixes.setdefault(company_id, Counter())[match.group(1)] += 1

    used: set[str] = set()
    codes: dict[str, str] = {}
    # Customers whose panels already carry a prefix keep it exactly, so their PNUMBER series continues.
    for company_id, _name in customers:
        if company_id in prefixes:
            code = prefixes[company_id].most_common(1)[0][0][:12]
            codes[company_id] = code
            used.add(code)
    # Everyone else gets a unique code from their name.
    for company_id, name in customers:
        if company_id in codes:
            continue
        base = _name_code(name, "CUST")
        code, suffix = base, 2
        while code in used:
            code, suffix = f"{base}{suffix}", suffix + 1
        codes[company_id] = code
        used.add(code)
    for company_id, code in codes.items():
        bind.execute(sa.text("UPDATE customers SET customer_code = :code WHERE id = :id"), {"code": code, "id": company_id})


def downgrade() -> None:
    op.drop_index("ix_customers_customer_code", table_name="customers")
    op.drop_column("customers", "notes")
    op.drop_column("customers", "customer_code")
