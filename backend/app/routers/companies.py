import base64

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.permissions import (
    can_create_company,
    can_manage_company_users,
    can_view_company,
    can_write_company,
)
from app.crud import company as crud
from app.database import get_db
from app.models.user import User
from app.schemas.company import CompanyCreate, CompanyRead, CompanyUpdate

router = APIRouter(prefix="/api/companies", tags=["companies"])


@router.get("", response_model=list[CompanyRead], response_model_exclude={"__all__": {"logo_data"}})
def list_companies(
    reseller_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    all_companies = crud.list_companies(db, reseller_id)
    return [c for c in all_companies if can_view_company(user, db, c.id, c.reseller_id)]


@router.post("", response_model=CompanyRead, status_code=status.HTTP_201_CREATED)
def create_company(
    data: CompanyCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not can_create_company(user, data.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to create companies here")
    if crud.get_company_by_name(db, data.reseller_id, data.name):
        raise HTTPException(status.HTTP_409_CONFLICT, "a customer with the same name already exists for this reseller")
    return crud.create_company(db, data)


@router.get("/{company_id}", response_model=CompanyRead)
def get_company(
    company_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    company = crud.get_company(db, company_id)
    if not company or not can_view_company(user, db, company.id, company.reseller_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "company not found")
    return company


@router.patch("/{company_id}", response_model=CompanyRead)
def update_company(
    company_id: str,
    data: CompanyUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    company = crud.get_company(db, company_id)
    if not company:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "company not found")
    if not can_write_company(user, db, company.id, company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to edit this company")
    target_reseller_id = data.reseller_id or company.reseller_id
    if data.name is not None and crud.get_company_by_name(db, target_reseller_id, data.name, exclude_id=company.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "a customer with the same name already exists for this reseller")
    return crud.update_company(db, company, data)


@router.post("/{company_id}/logo", response_model=CompanyRead)
async def upload_company_logo(company_id: str, logo: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    company = crud.get_company(db, company_id)
    if not company:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "company not found")
    if not can_manage_company_users(user, company.id, company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to edit this company")
    if logo.content_type not in {"image/png", "image/jpeg"}:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "logo must be a PNG or JPEG image")
    content = await logo.read()
    if not content or len(content) > 2 * 1024 * 1024:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "logo must be smaller than 2 MB")
    company.logo_data = f"data:{logo.content_type};base64,{base64.b64encode(content).decode('ascii')}"
    db.commit()
    db.refresh(company)
    return company


@router.delete("/{company_id}", response_model=CompanyRead)
def archive_company(
    company_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    company = crud.get_company(db, company_id)
    if not company:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "company not found")
    if not can_write_company(user, db, company.id, company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to archive this company")
    return crud.archive_company(db, company)


@router.delete("/{company_id}/permanent", status_code=status.HTTP_204_NO_CONTENT)
def delete_company_permanently(
    company_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    company = crud.get_company(db, company_id)
    if not company:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "company not found")
    if company.status != "archived":
        raise HTTPException(status.HTTP_409_CONFLICT, "customer must be archived before it can be deleted")
    if not can_write_company(user, db, company.id, company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to delete this customer")
    crud.delete_company(db, company)
