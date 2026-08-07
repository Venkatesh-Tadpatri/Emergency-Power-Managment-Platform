from datetime import date

from pydantic import BaseModel, ConfigDict


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


class ReportDetail(ReportListItem):
    load_profile_data: list[int] | None = None
