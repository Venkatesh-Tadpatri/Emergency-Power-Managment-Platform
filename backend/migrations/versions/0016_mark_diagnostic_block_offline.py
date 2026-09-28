"""mark the Mepstra Aster Prime Diagnostic Block system offline

Revision ID: 0016
Revises: 0015
"""

from alembic import op


revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE systems AS s "
        "JOIN customers AS c ON s.company_id = c.id "
        "JOIN resellers AS r ON c.reseller_id = r.id "
        "SET s.status = 'offline' "
        "WHERE r.name = 'Mepstra Power Solutions' "
        "AND c.name = 'Aster Prime' "
        "AND s.name = 'Diagnostic Block'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE systems AS s "
        "JOIN customers AS c ON s.company_id = c.id "
        "JOIN resellers AS r ON c.reseller_id = r.id "
        "SET s.status = 'normal' "
        "WHERE r.name = 'Mepstra Power Solutions' "
        "AND c.name = 'Aster Prime' "
        "AND s.name = 'Diagnostic Block' "
        "AND s.status = 'offline'"
    )
