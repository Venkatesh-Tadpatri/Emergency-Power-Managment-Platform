from sqlalchemy.orm import Session

from app.models.site import Site
from app.schemas.site import SiteCreate, SiteUpdate


def list_sites(db: Session, customer_id: str | None = None) -> list[Site]:
    query = db.query(Site)
    if customer_id:
        query = query.filter(Site.customer_id == customer_id)
    return query.order_by(Site.name).all()


def get_site(db: Session, site_id: str) -> Site | None:
    return db.get(Site, site_id)


def create_site(db: Session, data: SiteCreate) -> Site:
    site = Site(**data.model_dump())
    db.add(site)
    db.commit()
    db.refresh(site)
    return site


def update_site(db: Session, site: Site, data: SiteUpdate) -> Site:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(site, field, value)
    db.commit()
    db.refresh(site)
    return site


def archive_site(db: Session, site: Site) -> Site:
    site.status = "archived"
    db.commit()
    db.refresh(site)
    return site
