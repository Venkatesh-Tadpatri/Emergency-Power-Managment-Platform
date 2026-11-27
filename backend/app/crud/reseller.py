from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.reseller import Reseller
from app.schemas.reseller import ResellerCreate, ResellerUpdate


def list_resellers(db: Session) -> list[Reseller]:
    return db.query(Reseller).order_by(Reseller.name).all()


def get_reseller(db: Session, reseller_id: str) -> Reseller | None:
    return db.get(Reseller, reseller_id)


def get_reseller_by_name(db: Session, name: str, exclude_id: str | None = None) -> Reseller | None:
    query = db.query(Reseller).filter(func.lower(func.trim(Reseller.name)) == name.strip().lower())
    if exclude_id:
        query = query.filter(Reseller.id != exclude_id)
    return query.first()


def create_reseller(db: Session, data: ResellerCreate) -> Reseller:
    reseller = Reseller(**data.model_dump())
    db.add(reseller)
    db.commit()
    db.refresh(reseller)
    return reseller


def update_reseller(db: Session, reseller: Reseller, data: ResellerUpdate) -> Reseller:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(reseller, field, value)
    db.commit()
    db.refresh(reseller)
    return reseller


def archive_reseller(db: Session, reseller: Reseller) -> Reseller:
    reseller.status = "archived"
    db.commit()
    db.refresh(reseller)
    return reseller


def unarchive_reseller(db: Session, reseller: Reseller) -> Reseller:
    reseller.status = "active"
    db.commit()
    db.refresh(reseller)
    return reseller


def delete_reseller(db: Session, reseller: Reseller) -> None:
    db.delete(reseller)
    db.commit()
