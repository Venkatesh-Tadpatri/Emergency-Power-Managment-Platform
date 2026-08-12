"""replace UUID primary keys with readable entity IDs

Revision ID: 0002
Revises: 0001
"""

from alembic import op
import sqlalchemy as sa


revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def _map_ids(connection, table: str, prefix: str, order_column: str = "created_at") -> None:
    connection.execute(
        sa.text(
            f"""
            INSERT INTO id_mappings (entity, old_id, new_id)
            SELECT :entity, id, CONCAT(:prefix, '-', LPAD(ROW_NUMBER() OVER (ORDER BY {order_column}, id), 4, '0'))
            FROM {table}
            """
        ),
        {"entity": table, "prefix": prefix},
    )


def _replace_reference(connection, table: str, column: str, entity: str) -> None:
    connection.execute(
        sa.text(
            f"""
            UPDATE {table} t
            JOIN id_mappings m ON m.entity = :entity AND m.old_id = t.{column}
            SET t.{column} = m.new_id
            """
        ),
        {"entity": entity},
    )


def _replace_primary_key(connection, table: str) -> None:
    connection.execute(
        sa.text(
            f"""
            UPDATE {table} t
            JOIN id_mappings m ON m.entity = :entity AND m.old_id = t.id
            SET t.id = m.new_id
            """
        ),
        {"entity": table},
    )


def upgrade() -> None:
    connection = op.get_bind()
    op.create_table(
        "id_sequences",
        sa.Column("prefix", sa.String(10), primary_key=True),
        sa.Column("next_value", sa.Integer, nullable=False),
    )
    connection.execute(sa.text("SET FOREIGN_KEY_CHECKS = 0"))
    connection.execute(
        sa.text(
            "CREATE TEMPORARY TABLE id_mappings ("
            "entity VARCHAR(64) NOT NULL, old_id VARCHAR(36) NOT NULL, "
            "new_id VARCHAR(36) NOT NULL, PRIMARY KEY (entity, old_id))"
        )
    )

    entities = [
        ("resellers", "RES"), ("companies", "CMP"), ("systems", "SYS"),
        ("panels", "PNL"), ("ats_devices", "ATS"), ("generators", "GEN"),
        ("meters", "MTR"), ("users", "USR"), ("user_assigned_systems", "UAS"),
        ("alarms", "ALM"), ("reports", "RPT"), ("oncall_shifts", "ONC"),
        ("alert_schedules", "ASC"), ("alert_rules", "ARL"),
    ]
    for table, prefix in entities:
        _map_ids(connection, table, prefix, "id" if table == "user_assigned_systems" else "created_at")

    for table, column, entity in [
        ("companies", "reseller_id", "resellers"),
        ("systems", "company_id", "companies"),
        ("panels", "system_id", "systems"),
        ("ats_devices", "panel_id", "panels"),
        ("generators", "panel_id", "panels"),
        ("meters", "ats_id", "ats_devices"),
        ("users", "reseller_id", "resellers"),
        ("users", "company_id", "companies"),
        ("user_assigned_systems", "user_id", "users"),
        ("user_assigned_systems", "system_id", "systems"),
        ("alarms", "system_id", "systems"),
        ("reports", "company_id", "companies"),
        ("reports", "system_id", "systems"),
        ("oncall_shifts", "company_id", "companies"),
        ("alert_schedules", "company_id", "companies"),
        ("alert_rules", "alert_schedule_id", "alert_schedules"),
    ]:
        _replace_reference(connection, table, column, entity)
    for table, _prefix in entities:
        _replace_primary_key(connection, table)

    for table, prefix in entities:
        connection.execute(
            sa.text(f"INSERT INTO id_sequences (prefix, next_value) SELECT :prefix, COUNT(*) + 1 FROM {table}"),
            {"prefix": prefix},
        )
    connection.execute(sa.text("SET FOREIGN_KEY_CHECKS = 1"))


def downgrade() -> None:
    # Generated readable IDs cannot be safely restored to their former UUIDs.
    raise NotImplementedError("Readable ID migration is intentionally irreversible")
