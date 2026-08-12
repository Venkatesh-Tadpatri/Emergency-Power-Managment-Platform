from datetime import datetime, timezone

from sqlalchemy import DateTime, String, event, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class UUIDPKMixin:
    """Primary key populated as a readable, per-entity sequence before insert."""

    id: Mapped[str] = mapped_column(String(36), primary_key=True)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow, nullable=False
    )


# Kept beside the model base so the rule applies to API-created and seed-created
# rows alike. The database migration creates and initializes ``id_sequences``.
ID_PREFIXES = {
    "resellers": "RES",
    "customers": "CUS",
    "sites": "SIT",
    "systems": "SYS",
    "panels": "PNL",
    "ats_devices": "ATS",
    "generators": "GEN",
    "meters": "MTR",
    "users": "USR",
    "user_assigned_systems": "UAS",
    "alarms": "ALM",
    "reports": "RPT",
    "oncall_shifts": "ONC",
    "alert_schedules": "ASC",
    "alert_rules": "ARL",
}


@event.listens_for(Base, "before_insert", propagate=True)
def assign_readable_id(_mapper, connection, target) -> None:
    """Assign IDs such as ``CMP-0001`` atomically for newly-created rows."""
    if getattr(target, "id", None):
        return
    prefix = ID_PREFIXES.get(target.__tablename__)
    if prefix is None:
        return
    if connection.dialect.name == "sqlite":
        # The test suite uses SQLite. Its write locking makes this simple
        # read/increment/write sequence safe for the test database.
        sequence = connection.execute(
            text("SELECT next_value FROM id_sequences WHERE prefix = :prefix"),
            {"prefix": prefix},
        ).scalar_one_or_none()
        if sequence is None:
            sequence = 1
            connection.execute(
                text("INSERT INTO id_sequences (prefix, next_value) VALUES (:prefix, 2)"),
                {"prefix": prefix},
            )
        else:
            connection.execute(
                text("UPDATE id_sequences SET next_value = :next_value WHERE prefix = :prefix"),
                {"next_value": sequence + 1, "prefix": prefix},
            )
        target.id = f"{prefix}-{sequence:04d}"
        return
    connection.execute(
        text(
            "INSERT INTO id_sequences (prefix, next_value) "
            "VALUES (:prefix, LAST_INSERT_ID(2)) "
            "ON DUPLICATE KEY UPDATE next_value = LAST_INSERT_ID(next_value + 1)"
        ),
        {"prefix": prefix},
    )
    sequence = connection.execute(text("SELECT LAST_INSERT_ID()")).scalar_one() - 1
    target.id = f"{prefix}-{sequence:04d}"
