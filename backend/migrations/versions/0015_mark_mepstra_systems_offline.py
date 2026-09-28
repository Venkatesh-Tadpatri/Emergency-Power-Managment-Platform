"""mark selected Mepstra Power Solutions demo systems offline

Revision ID: 0015
Revises: 0014
"""

from alembic import op


revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


OFFLINE_SYSTEMS = (
    ("Apollo Hospital", "Emergency & Trauma Center"),
    ("Aster Prime", "Emergency Department"),
    ("Hyderabad Data Center", "Data Hall B"),
)


def upgrade() -> None:
    for customer_name, system_name in OFFLINE_SYSTEMS:
        op.execute(
            "UPDATE systems AS s "
            "JOIN customers AS c ON s.company_id = c.id "
            "JOIN resellers AS r ON c.reseller_id = r.id "
            "SET s.status = 'offline' "
            "WHERE r.name = 'Mepstra Power Solutions' "
            f"AND c.name = '{customer_name}' "
            f"AND s.name = '{system_name}'"
        )


def downgrade() -> None:
    for customer_name, system_name in OFFLINE_SYSTEMS:
        op.execute(
            "UPDATE systems AS s "
            "JOIN customers AS c ON s.company_id = c.id "
            "JOIN resellers AS r ON c.reseller_id = r.id "
            "SET s.status = 'normal' "
            "WHERE r.name = 'Mepstra Power Solutions' "
            f"AND c.name = '{customer_name}' "
            f"AND s.name = '{system_name}' "
            "AND s.status = 'offline'"
        )
