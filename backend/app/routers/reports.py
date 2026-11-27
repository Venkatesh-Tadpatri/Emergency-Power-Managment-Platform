from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.permissions import can_view_company, can_view_system
from app.crud import company as company_crud
from app.crud import report as crud
from app.crud import system as system_crud
from app.database import get_db
from app.models.user import User
from app.schemas.report import ReportDetail, ReportListItem
from app.services.analytical_report_pdf import BRANCH_FILTERS, build_initiating_ats_pdf, build_time_to_buss_pdf
from app.services.report_pdf import build_report_pdf

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("", response_model=list[ReportListItem])
def list_reports(
    company_id: str | None = Query(default=None),
    system_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if system_id:
        system = system_crud.get_system(db, system_id)
        if not system or not can_view_system(user, db, system):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "system not found")
    elif company_id:
        company = company_crud.get_company(db, company_id)
        if not company or not can_view_company(user, db, company.id, company.reseller_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "company not found")
    elif user.role != "superadmin":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "company_id or system_id is required")
    return [report for report in crud.list_reports(db, company_id, system_id)
            if can_view_system(user, db, report.system)]


@router.get("/analytical/{kind}/pdf")
def download_analytical_report_pdf(
    kind: str,
    company_id: str = Query(min_length=1),
    start: date = Query(),
    end: date = Query(),
    branch: str = Query(default="all"),
    omit_over_limit: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Downloadable PDF of the Reports page's Initiating ATS / Average Time to Buss tab, rebuilt from
    the stored reports with the same date range and filters the page applied."""
    if kind not in {"initiating-ats", "time-to-buss"}:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "unknown report")
    if branch not in BRANCH_FILTERS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "branch must be all, life-safety, critical or equipment")
    if start > end:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "start date must be on or before end date")
    company = company_crud.get_company(db, company_id)
    if not company or not can_view_company(user, db, company.id, company.reseller_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "company not found")
    reports = [report for report in crud.list_reports(db, company_id, None) if can_view_system(user, db, report.system)]
    reseller = company.reseller
    logos = (company.logo_data, reseller.logo_data if reseller and reseller.show_logo_on_reports else None)
    if kind == "time-to-buss":
        pdf_bytes = build_time_to_buss_pdf(reports, company.name, start, end, branch, omit_over_limit, *logos)
        filename = f"Average-Time-to-Buss-Report_{start.isoformat()}_{end.isoformat()}.pdf"
    else:
        system_names = {report.system_id: report.system.name for report in reports}
        pdf_bytes = build_initiating_ats_pdf(reports, company.name, system_names, start, end, *logos)
        filename = f"Initiating-ATS-Report_{start.isoformat()}_{end.isoformat()}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{report_id}", response_model=ReportDetail)
def get_report(
    report_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    report = crud.get_report(db, report_id)
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "report not found")
    if not can_view_system(user, db, report.system):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "report not found")
    return report


@router.get("/{report_id}/pdf")
def download_report_pdf(
    report_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    report = crud.get_report(db, report_id)
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "report not found")
    if not can_view_system(user, db, report.system):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "report not found")
    reseller = report.company.reseller
    pdf_bytes = build_report_pdf(
        report, report.system.name, report.company.name, report.company.logo_data,
        reseller.logo_data if reseller.show_logo_on_reports else None,
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{report.report_code}.pdf"'},
    )
