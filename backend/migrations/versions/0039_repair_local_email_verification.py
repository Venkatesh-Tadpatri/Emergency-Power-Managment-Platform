"""repair verification state for unverified local registrations

Revision ID: 0039
Revises: 0038
"""

from alembic import op
import sqlalchemy as sa


revision = "0039"
down_revision = "0038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # An earlier legacy backfill could mark local registrations verified merely
    # because they already existed. A local account is verified only when it has
    # a successfully consumed email-verification OTP. Preserve legacy ZITADEL
    # accounts and genuinely verified local registrations.
    op.execute(
        sa.text(
            "UPDATE users SET email_verified_at = NULL, account_state = 'pending' "
            "WHERE zitadel_sub IS NULL "
            "AND NOT EXISTS ("
            "SELECT 1 FROM auth_otps "
            "WHERE auth_otps.user_id = users.id "
            "AND auth_otps.purpose = 'email_verification' "
            "AND auth_otps.consumed_at IS NOT NULL"
            ")"
        )
    )


def downgrade() -> None:
    # The incorrect verified state cannot be reconstructed safely.
    pass
