from sqlalchemy.orm import Session

from app.models.system import System
from app.models.site import Site
from app.schemas.system import SystemCreate, SystemUpdate


def list_systems(db: Session, company_id: str | None = None, site_id: str | None = None) -> list[System]:
    q = db.query(System)
    if company_id:
        q = q.filter(System.company_id == company_id)
    if site_id:
        q = q.filter(System.site_id == site_id)
    return q.order_by(System.name).all()


def get_system(db: Session, system_id: str) -> System | None:
    return db.get(System, system_id)


def create_system(db: Session, data: SystemCreate) -> System:
    values = data.model_dump()
    # Until dedicated Site management is exposed, creating a system from the
    # existing screen also creates its containing site. This keeps the required
    # Customer -> Site -> System hierarchy intact.
    if not values.get("site_id"):
        site = Site(
            name=f"{values['name']} Site",
            address=values.get("address"),
            lat=values.get("lat"),
            lng=values.get("lng"),
            customer_id=values["company_id"],
        )
        db.add(site)
        db.flush()
        values["site_id"] = site.id
    system = System(**values)
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
