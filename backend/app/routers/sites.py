from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.permissions import can_view_company, can_write_system
from app.crud import company as company_crud
from app.crud import site as crud
from app.database import get_db
from app.models.user import User
from app.schemas.site import SiteCreate, SiteRead, SiteUpdate

router = APIRouter(prefix="/api/sites", tags=["sites"])


def _can_view_site(user: User, db: Session, site) -> bool:
    customer = company_crud.get_company(db, site.customer_id)
    return bool(customer and can_view_company(user, db, customer.id, customer.reseller_id))


@router.get("", response_model=list[SiteRead])
def list_sites(customer_id: str | None = Query(default=None), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return [site for site in crud.list_sites(db, customer_id) if _can_view_site(user, db, site)]


@router.post("", response_model=SiteRead, status_code=status.HTTP_201_CREATED)
def create_site(data: SiteCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    customer = company_crud.get_company(db, data.customer_id)
    if not customer:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "customer not found")
    if not can_write_system(user, db, customer.id, customer.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to create sites here")
    return crud.create_site(db, data)


@router.get("/{site_id}", response_model=SiteRead)
def get_site(site_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    site = crud.get_site(db, site_id)
    if not site or not _can_view_site(user, db, site):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "site not found")
    return site


@router.patch("/{site_id}", response_model=SiteRead)
def update_site(site_id: str, data: SiteUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    site = crud.get_site(db, site_id)
    customer = company_crud.get_company(db, site.customer_id) if site else None
    if not site or not customer:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "site not found")
    if not can_write_system(user, db, customer.id, customer.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to edit this site")
    return crud.update_site(db, site, data)


@router.delete("/{site_id}", response_model=SiteRead)
def archive_site(site_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    site = crud.get_site(db, site_id)
    customer = company_crud.get_company(db, site.customer_id) if site else None
    if not site or not customer:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "site not found")
    if not can_write_system(user, db, customer.id, customer.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to archive this site")
    return crud.archive_site(db, site)
