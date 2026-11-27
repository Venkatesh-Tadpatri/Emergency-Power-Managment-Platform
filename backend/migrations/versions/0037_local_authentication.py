"""add local authentication

Revision ID: 0037
Revises: 0036
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "0037"
down_revision: Union[str, None] = "0036"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("users", "zitadel_sub", existing_type=sa.String(255), nullable=True)
    op.create_unique_constraint("uq_users_email", "users", ["email"])
    op.add_column("users", sa.Column("first_name", sa.String(100)))
    op.add_column("users", sa.Column("last_name", sa.String(100)))
    op.add_column("users", sa.Column("contact_number", sa.String(30)))
    op.add_column("users", sa.Column("requested_company_name", sa.String(255)))
    op.add_column("users", sa.Column("password_hash", sa.String(512)))
    op.add_column("users", sa.Column("account_state", sa.String(20), nullable=False, server_default="active"))
    op.add_column("users", sa.Column("email_verified_at", sa.DateTime()))
    op.add_column("users", sa.Column("failed_login_attempts", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("locked_until", sa.DateTime()))
    # ZITADEL-backed rows are legacy accounts and must retain their directory
    # visibility. Local registrations have no ZITADEL subject and must verify
    # their OTP before becoming visible.
    op.execute(
        sa.text(
            "UPDATE users SET email_verified_at = CURRENT_TIMESTAMP "
            "WHERE zitadel_sub IS NOT NULL"
        )
    )
    op.create_table("auth_otps", sa.Column("id", sa.String(36), primary_key=True), sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False), sa.Column("purpose", sa.String(30), nullable=False), sa.Column("code_hash", sa.String(128), nullable=False), sa.Column("expires_at", sa.DateTime(), nullable=False), sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"), sa.Column("consumed_at", sa.DateTime()), sa.Column("created_at", sa.DateTime(), nullable=False), sa.Column("updated_at", sa.DateTime(), nullable=False))
    op.create_index("ix_auth_otps_user_id", "auth_otps", ["user_id"])


def downgrade() -> None:
    op.drop_table("auth_otps")
    for column in ("locked_until", "failed_login_attempts", "email_verified_at", "account_state", "password_hash", "requested_company_name", "contact_number", "last_name", "first_name"):
        op.drop_column("users", column)
    op.drop_constraint("uq_users_email", "users", type_="unique")
    op.alter_column("users", "zitadel_sub", existing_type=sa.String(255), nullable=False)
