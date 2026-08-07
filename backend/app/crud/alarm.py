from sqlalchemy.orm import Session

from app.models.alarm import Alarm
from app.models.system import System


def list_alarms(
    db: Session,
    system_id: str | None = None,
    company_id: str | None = None,
    reseller_id: str | None = None,
) -> list[Alarm]:
    q = db.query(Alarm).join(System, Alarm.system_id == System.id)
    if system_id:
        q = q.filter(Alarm.system_id == system_id)
    if company_id:
        q = q.filter(System.company_id == company_id)
    if reseller_id:
        from app.models.company import Company

        q = q.join(Company, System.company_id == Company.id).filter(
            Company.reseller_id == reseller_id
        )
    return q.order_by(Alarm.occurred_at.desc()).all()
