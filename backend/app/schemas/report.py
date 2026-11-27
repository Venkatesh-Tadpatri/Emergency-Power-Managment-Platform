from datetime import date

from pydantic import BaseModel, ConfigDict


class AtsTransferDetail(BaseModel):
    ats_name: str
    branch: str | None = None
    manufacturer: str | None = None
    serial_number: str | None = None
    switched_to_emergency: str | None = None
    switched_to_normal: str | None = None
    time_to_bus_sec: float | None = None
    time_to_available_sec: float | None = None
    on_emergency_duration: str | None = None


class ReportListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    company_id: str
    system_id: str
    report_code: str
    type: str
    report_date: date
    time_label: str | None = None
    duration_label: str | None = None
    duration_min: int | None = None
    initiating_ats: str | None = None
    rated_kw: int | None = None
    peak_kw: int | None = None
    avg_kw: int | None = None
    event_type: str | None = None
    # Included at list level (not just ReportDetail) — the Initiating ATS / Time to Buss analytical
    # reports (CompanyReports.jsx) aggregate this across every report in a date range and would
    # otherwise need an extra per-report detail fetch just to build those tables.
    ats_details: list[AtsTransferDetail] | None = None


class TelemetryLogRow(BaseModel):
    time: str
    vab: float | None = None
    vbc: float | None = None
    vca: float | None = None
    ia: float | None = None
    ib: float | None = None
    ic: float | None = None
    kw: float | None = None
    pct_kw: float | None = None
    oil_psi: float | None = None
    water_temp_f: float | None = None
    batt_v: float | None = None
    hours: float | None = None


class ReportDetail(ReportListItem):
    load_profile_data: list[int] | None = None
    make: str | None = None
    model: str | None = None
    serial_number: str | None = None
    rated_voltage: int | None = None
    rated_amperage: int | None = None
    start_hours: float | None = None
    end_hours: float | None = None
    telemetry_log: list[TelemetryLogRow] | None = None
