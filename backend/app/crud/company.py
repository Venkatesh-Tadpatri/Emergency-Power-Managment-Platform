from sqlalchemy import func
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


def get_company_by_name(db: Session, reseller_id: str, name: str, exclude_id: str | None = None) -> Company | None:
    query = db.query(Company).filter(
        Company.reseller_id == reseller_id,
        func.lower(func.trim(Company.name)) == name.strip().lower(),
    )
    if exclude_id:
        query = query.filter(Company.id != exclude_id)
    return query.first()


def name_code(name: str | None) -> str:
    """Base CUSTCODE from a name: its first four letters/digits, upper-cased (Aster Prime -> ASTE)."""
    return "".join(character for character in (name or "") if character.isalnum()).upper()[:4] or "CUST"


def unique_customer_code(db: Session, name: str) -> str:
    """A CUSTCODE no other customer uses — ASTE, then ASTE2, ASTE3, ... — so PNUMBERs never collide."""
    base = name_code(name)
    taken = {code for (code,) in db.query(Company.customer_code).filter(Company.customer_code.like(f"{base}%"))}
    code, suffix = base, 2
    while code in taken:
        code, suffix = f"{base}{suffix}", suffix + 1
    return code


def customer_code(db: Session, company: Company) -> str:
    """The customer's CUSTCODE, assigning one on first use for any row that predates the column."""
    if not company.customer_code:
        company.customer_code = unique_customer_code(db, company.name)
        db.flush()
    return company.customer_code


def create_company(db: Session, data: CompanyCreate) -> Company:
    company = Company(**data.model_dump(), customer_code=unique_customer_code(db, data.name))
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


def delete_company(db: Session, company: Company) -> None:
    db.delete(company)
    db.commit()
