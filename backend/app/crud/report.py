from sqlalchemy.orm import Session

from app.models.report import Report


def list_reports(
    db: Session, company_id: str | None = None, system_id: str | None = None
) -> list[Report]:
    q = db.query(Report)
    if company_id:
        q = q.filter(Report.company_id == company_id)
    if system_id:
        q = q.filter(Report.system_id == system_id)
    return q.order_by(Report.report_date.desc()).all()


def get_report(db: Session, report_id: str) -> Report | None:
    return db.get(Report, report_id)
