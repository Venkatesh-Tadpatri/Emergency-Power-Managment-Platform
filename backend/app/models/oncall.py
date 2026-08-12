from datetime import date as date_type

from sqlalchemy import Date, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class OnCallShift(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "oncall_shifts"

    company_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), nullable=False)
    shift_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    day_label: Mapped[str] = mapped_column(String(10), nullable=False)
    primary_name: Mapped[str] = mapped_column(String(255), nullable=False)
    secondary_name: Mapped[str | None] = mapped_column(String(255))
    shift_label: Mapped[str] = mapped_column(String(20), default="24h", nullable=False)

    company: Mapped["Customer"] = relationship()
