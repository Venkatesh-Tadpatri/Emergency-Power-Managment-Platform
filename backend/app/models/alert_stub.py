from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class AlertSchedule(Base, UUIDPKMixin, TimestampMixin):
    """Empty stub reserved for the future alerting/on-call rules engine (PRD Section 8.3)."""

    __tablename__ = "alert_schedules"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), nullable=False)

    rules: Mapped[list["AlertRule"]] = relationship(
        back_populates="alert_schedule", cascade="all, delete-orphan"
    )


class AlertRule(Base, UUIDPKMixin, TimestampMixin):
    """Empty stub reserved for the future alerting rules engine (PRD Section 8.3)."""

    __tablename__ = "alert_rules"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    alert_schedule_id: Mapped[str] = mapped_column(
        ForeignKey("alert_schedules.id"), nullable=False
    )
    condition: Mapped[str | None] = mapped_column(String(500))

    alert_schedule: Mapped["AlertSchedule"] = relationship(back_populates="rules")
