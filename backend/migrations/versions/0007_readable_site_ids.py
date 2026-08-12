"""replace legacy UUID site IDs with readable IDs

Revision ID: 0007
Revises: 0006
"""

import sqlalchemy as sa
from alembic import op


revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Give every site a stable ``SIT-0001``-style identifier.

    Sites were added after the original readable-ID migration, so the initial
    hierarchy migrations stored UUIDs in both ``sites.id`` and
    ``systems.site_id``.  The temporary IDs make this safe even if a database
    already contains some newly-created ``SIT-*`` records.
    """
    bind = op.get_bind()
    bind.execute(sa.text("SET FOREIGN_KEY_CHECKS = 0"))
    try:
        bind.execute(
            sa.text(
                "CREATE TEMPORARY TABLE site_id_mappings ("
                "old_id VARCHAR(36) NOT NULL PRIMARY KEY, "
                "new_id VARCHAR(36) NOT NULL UNIQUE)"
            )
        )
        bind.execute(
            sa.text(
                "INSERT INTO site_id_mappings (old_id, new_id) "
                "SELECT id, CONCAT('SIT-', LPAD(ROW_NUMBER() OVER "
                "(ORDER BY created_at, id), 4, '0')) FROM sites"
            )
        )

        # Perform the rename in two phases to prevent unique-key collisions.
        bind.execute(
            sa.text(
                "UPDATE systems s JOIN site_id_mappings m ON m.old_id = s.site_id "
                "SET s.site_id = CONCAT('TMP-SITE-', m.new_id)"
            )
        )
        bind.execute(
            sa.text(
                "UPDATE sites s JOIN site_id_mappings m ON m.old_id = s.id "
                "SET s.id = CONCAT('TMP-SITE-', m.new_id)"
            )
        )
        bind.execute(
            sa.text(
                "UPDATE sites s JOIN site_id_mappings m "
                "ON s.id = CONCAT('TMP-SITE-', m.new_id) SET s.id = m.new_id"
            )
        )
        bind.execute(
            sa.text(
                "UPDATE systems s JOIN site_id_mappings m "
                "ON s.site_id = CONCAT('TMP-SITE-', m.new_id) SET s.site_id = m.new_id"
            )
        )

        bind.execute(sa.text("DELETE FROM id_sequences WHERE prefix = 'SIT'"))
        bind.execute(
            sa.text(
                "INSERT INTO id_sequences (prefix, next_value) "
                "SELECT 'SIT', COUNT(*) + 1 FROM sites"
            )
        )
    finally:
        bind.execute(sa.text("SET FOREIGN_KEY_CHECKS = 1"))


def downgrade() -> None:
    raise NotImplementedError("Readable site IDs cannot be safely converted back to UUIDs")
