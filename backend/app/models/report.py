from datetime import date as date_type

from sqlalchemy import Date, Float, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class Report(Base, UUIDPKMixin, TimestampMixin):
    """Report record — backs both the Generator Run Report and ATS Transfer Report layouts (see
    ``type``), plus a downloadable PDF export of either (app/routers/reports.py)."""

    __tablename__ = "reports"

    company_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), nullable=False)
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

    # --- Generator Run Report (type == "gen-run") ---
    # A snapshot of the generator's own nameplate data at report time, not a live lookup against the
    # generators table, so the report still reads correctly even if the unit's config changes later.
    make: Mapped[str | None] = mapped_column(String(100))
    model: Mapped[str | None] = mapped_column(String(100))
    serial_number: Mapped[str | None] = mapped_column(String(100))
    rated_voltage: Mapped[int | None] = mapped_column(Integer)
    rated_amperage: Mapped[int | None] = mapped_column(Integer)
    start_hours: Mapped[float | None] = mapped_column(Float)
    end_hours: Mapped[float | None] = mapped_column(Float)
    # Array of per-sample rows: {time, vab, vbc, vca, ia, ib, ic, kw, pct_kw, oil_psi, water_temp_f,
    # batt_v, hours} — the telemetry data log table on the Generator Run Report.
    telemetry_log: Mapped[list | None] = mapped_column(JSON)

    # --- ATS Transfer Report (type == "ats-emergency" | "test") ---
    event_type: Mapped[str | None] = mapped_column(String(30))
    # Array of per-ATS rows: {ats_name, branch, manufacturer, serial_number, switched_to_emergency,
    # switched_to_normal, time_to_bus_sec, time_to_available_sec, on_emergency_duration}.
    ats_details: Mapped[list | None] = mapped_column(JSON)

    company: Mapped["Customer"] = relationship()
    system: Mapped["System"] = relationship()
