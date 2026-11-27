from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class AssetAlarmDisable(Base, UUIDPKMixin, TimestampMixin):
    """An active alarm suppression for one asset (generator, ATS, fuel tank, ...) within a system.

    Mirrors the system-level ``System.alarms_disabled*`` fields, scoped to one piece of equipment.
    ``record_key`` is the same key the equipment popup uses for its Notes, so the disable/re-enable
    notes land on that asset's Notes tab. A row exists only while alarms are disabled; re-enabling
    (manually or automatically when the period ends) deletes it after recording the event and note.
    """

    __tablename__ = "asset_alarm_disables"
    __table_args__ = (UniqueConstraint("system_id", "record_key", name="uq_asset_alarm_disables_system_record"),)

    system_id: Mapped[str] = mapped_column(ForeignKey("systems.id"), nullable=False, index=True)
    record_key: Mapped[str] = mapped_column(String(255), nullable=False)
    asset_name: Mapped[str] = mapped_column(String(255), nullable=False)
    disabled_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    disabled_until: Mapped[datetime | None] = mapped_column(DateTime)
    indefinite: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    # Not a foreign key: the suppression (and its attribution snapshot) must survive the user's removal.
    disabled_by_user_id: Mapped[str | None] = mapped_column(String(36))
    disabled_by_name: Mapped[str | None] = mapped_column(String(255))
    disabled_by_email: Mapped[str | None] = mapped_column(String(255))
    reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime)
