from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class System(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "systems"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str | None] = mapped_column(String(500))
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    company_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), nullable=False)
    site_id: Mapped[str] = mapped_column(ForeignKey("sites.id"), nullable=False)
    # Display-only status snapshot (normal/emergency/alarm/test/offline) — not live telemetry.
    status: Mapped[str] = mapped_column(String(20), default="normal", nullable=False)
    # Soft-deleted: hidden from system lists but kept (with its panels/ATS/generators) for recovery.
    archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    alarms_disabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    alarms_disabled_at: Mapped[datetime | None] = mapped_column(DateTime)
    alarms_disabled_until: Mapped[datetime | None] = mapped_column(DateTime)
    alarms_disabled_indefinitely: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    alarms_disabled_reason: Mapped[str | None] = mapped_column(Text)
    alarms_disabled_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    alarms_disabled_by_name: Mapped[str | None] = mapped_column(String(255))
    alarms_disabled_by_email: Mapped[str | None] = mapped_column(String(255))
    alarms_reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime)

    company: Mapped["Customer"] = relationship(back_populates="systems")
    site: Mapped["Site"] = relationship(back_populates="systems")
    panels: Mapped[list["Panel"]] = relationship(
        back_populates="system", cascade="all, delete-orphan"
    )

    @property
    def site_name(self) -> str | None:
        return self.site.name if self.site else None


class SystemEvent(Base, UUIDPKMixin):
    __tablename__ = "system_events"

    system_id: Mapped[str] = mapped_column(ForeignKey("systems.id"), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    message: Mapped[str] = mapped_column(String(1000), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    actor_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    actor_name: Mapped[str | None] = mapped_column(String(255))
    reason: Mapped[str | None] = mapped_column(Text)
