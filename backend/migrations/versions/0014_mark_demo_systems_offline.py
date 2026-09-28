"""mark selected CriticalPath and PowerGuard demo systems offline

Revision ID: 0014
Revises: 0013
"""

from alembic import op


revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


OFFLINE_SYSTEMS = (
    ("PowerGuard Solutions", "Kimmel Building"),
    ("PowerGuard Solutions", "Main Campus MDP-1"),
    ("CriticalPath Energy", "Bloomberg Tower"),
    ("CriticalPath Energy", "Burnett-Womack"),
)


def upgrade() -> None:
    for reseller_name, system_name in OFFLINE_SYSTEMS:
        op.execute(
            "UPDATE systems AS s "
            "JOIN customers AS c ON s.company_id = c.id "
            "JOIN resellers AS r ON c.reseller_id = r.id "
            "SET s.status = 'offline' "
            "WHERE "
            f"r.name = '{reseller_name}' "
            f"AND s.name = '{system_name}'"
        )


def downgrade() -> None:
    for reseller_name, system_name in OFFLINE_SYSTEMS:
        op.execute(
            "UPDATE systems AS s "
            "JOIN customers AS c ON s.company_id = c.id "
            "JOIN resellers AS r ON c.reseller_id = r.id "
            "SET s.status = 'normal' "
            "WHERE "
            f"r.name = '{reseller_name}' "
            f"AND s.name = '{system_name}' "
            "AND s.status = 'offline'"
        )
