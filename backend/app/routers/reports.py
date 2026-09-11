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
    pdf_bytes = build_report_pdf(report, report.system.name, report.company.name, report.company.logo_data)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{report.report_code}.pdf"'},
    )
