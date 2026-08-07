from sqlalchemy.orm import Session

from app.models.company import Company
from app.schemas.company import CompanyCreate, CompanyUpdate


def list_companies(db: Session, reseller_id: str | None = None) -> list[Company]:
    q = db.query(Company)
    if reseller_id:
        q = q.filter(Company.reseller_id == reseller_id)
    return q.order_by(Company.name).all()


def get_company(db: Session, company_id: str) -> Company | None:
    return db.get(Company, company_id)


def create_company(db: Session, data: CompanyCreate) -> Company:
    company = Company(**data.model_dump())
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


def update_company(db: Session, company: Company, data: CompanyUpdate) -> Company:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(company, field, value)
    db.commit()
    db.refresh(company)
    return company


def archive_company(db: Session, company: Company) -> Company:
    company.status = "archived"
    db.commit()
    db.refresh(company)
    return company
