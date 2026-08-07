from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.permissions import can_manage_oncall, can_view_company
from app.crud import company as company_crud
from app.crud import oncall as crud
from app.database import get_db
from app.models.user import User
from app.schemas.oncall import OnCallShiftCreate, OnCallShiftRead, OnCallShiftUpdate

router = APIRouter(prefix="/api/oncall", tags=["oncall"])


@router.get("", response_model=list[OnCallShiftRead])
def list_shifts(
    company_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    company = company_crud.get_company(db, company_id)
    if not company or not can_view_company(user, db, company.id, company.reseller_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "company not found")
    return crud.list_shifts(db, company_id)


@router.post("", response_model=OnCallShiftRead, status_code=status.HTTP_201_CREATED)
def create_shift(
    data: OnCallShiftCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    company = company_crud.get_company(db, data.company_id)
    if not company:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "company not found")
    if not can_manage_oncall(user, company.id, company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to manage on-call here")
    return crud.create_shift(db, data)


@router.patch("/{shift_id}", response_model=OnCallShiftRead)
def update_shift(
    shift_id: str,
    data: OnCallShiftUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    shift = crud.get_shift(db, shift_id)
    if not shift:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "shift not found")
    if not can_manage_oncall(user, shift.company_id, shift.company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to manage on-call here")
    return crud.update_shift(db, shift, data)


@router.delete("/{shift_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shift(
    shift_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    shift = crud.get_shift(db, shift_id)
    if not shift:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "shift not found")
    if not can_manage_oncall(user, shift.company_id, shift.company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to manage on-call here")
    crud.delete_shift(db, shift)
