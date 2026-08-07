from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class Alarm(Base, UUIDPKMixin, TimestampMixin):
    """Display-only demo alarm record. No detection engine behind it this milestone."""

    __tablename__ = "alarms"

    system_id: Mapped[str] = mapped_column(ForeignKey("systems.id"), nullable=False)
    device_label: Mapped[str | None] = mapped_column(String(100))
    severity: Mapped[str] = mapped_column(String(20), nullable=False)  # critical|warning|info
    message: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)  # active|cleared
    occurred_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    ack_by: Mapped[str | None] = mapped_column(String(255))
    ack_at: Mapped[datetime | None] = mapped_column(DateTime)

    system: Mapped["System"] = relationship()
