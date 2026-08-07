from sqlalchemy.orm import Session

from app.models.system import System
from app.schemas.system import SystemCreate, SystemUpdate


def list_systems(db: Session, company_id: str | None = None) -> list[System]:
    q = db.query(System)
    if company_id:
        q = q.filter(System.company_id == company_id)
    return q.order_by(System.name).all()


def get_system(db: Session, system_id: str) -> System | None:
    return db.get(System, system_id)


def create_system(db: Session, data: SystemCreate) -> System:
    system = System(**data.model_dump())
    db.add(system)
    db.commit()
    db.refresh(system)
    return system


def update_system(db: Session, system: System, data: SystemUpdate) -> System:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(system, field, value)
    db.commit()
    db.refresh(system)
    return system


def archive_system(db: Session, system: System) -> System:
    system.status = "offline"
    db.commit()
    db.refresh(system)
    return system
