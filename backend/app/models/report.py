from datetime import date as date_type

from sqlalchemy import Date, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class Report(Base, UUIDPKMixin, TimestampMixin):
    """Display-only demo report record (no PDF pipeline this milestone)."""

    __tablename__ = "reports"

    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), nullable=False)
    system_id: Mapped[str] = mapped_column(ForeignKey("systems.id"), nullable=False)
    report_code: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    # gen-run | ats-emergency | test
    type: Mapped[str] = mapped_column(String(30), nullable=False)
    report_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    time_label: Mapped[str | None] = mapped_column(String(20))
    duration_label: Mapped[str | None] = mapped_column(String(20))
    duration_min: Mapped[int | None] = mapped_column(Integer)
    initiating_ats: Mapped[str | None] = mapped_column(String(100))
    rated_kw: Mapped[int | None] = mapped_column(Integer)
    peak_kw: Mapped[int | None] = mapped_column(Integer)
    avg_kw: Mapped[int | None] = mapped_column(Integer)
    # Array of kW samples across the run, used to draw the canvas load-profile chart.
    load_profile_data: Mapped[list | None] = mapped_column(JSON)

    company: Mapped["Company"] = relationship()
    system: Mapped["System"] = relationship()
