"""mark pre-local-authentication users as email verified

Revision ID: 0038
Revises: 0037
"""

from alembic import op
import sqlalchemy as sa


revision = "0038"
down_revision = "0037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Covers databases where 0037 ran before its legacy-data backfill existed.
    # New local registrations have no ZITADEL subject and remain unverified.
    op.execute(
        sa.text(
            "UPDATE users SET email_verified_at = CURRENT_TIMESTAMP, "
            "account_state = 'active' "
            "WHERE zitadel_sub IS NOT NULL AND email_verified_at IS NULL"
        )
    )


def downgrade() -> None:
    # Verification is security state and must not be erased on downgrade.
    pass
