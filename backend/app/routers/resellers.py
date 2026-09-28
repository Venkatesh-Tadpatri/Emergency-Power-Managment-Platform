from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.permissions import can_manage_resellers, can_view_reseller
from app.crud import reseller as crud
from app.database import get_db
from app.models.user import User
from app.schemas.reseller import ResellerCreate, ResellerRead, ResellerUpdate

router = APIRouter(prefix="/api/resellers", tags=["resellers"])


@router.get("", response_model=list[ResellerRead])
def list_resellers(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    all_resellers = crud.list_resellers(db)
    return [r for r in all_resellers if can_view_reseller(user, db, r.id)]


@router.post("", response_model=ResellerRead, status_code=status.HTTP_201_CREATED)
def create_reseller(
    data: ResellerCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not can_manage_resellers(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only superadmin can manage resellers")
    return crud.create_reseller(db, data)


@router.get("/{reseller_id}", response_model=ResellerRead)
def get_reseller(
    reseller_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    reseller = crud.get_reseller(db, reseller_id)
    if not reseller or not can_view_reseller(user, db, reseller_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "reseller not found")
    return reseller


@router.patch("/{reseller_id}", response_model=ResellerRead)
def update_reseller(
    reseller_id: str,
    data: ResellerUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not can_manage_resellers(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only superadmin can manage resellers")
    reseller = crud.get_reseller(db, reseller_id)
    if not reseller:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "reseller not found")
    return crud.update_reseller(db, reseller, data)


@router.delete("/{reseller_id}", response_model=ResellerRead)
def archive_reseller(
    reseller_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    if not can_manage_resellers(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only superadmin can manage resellers")
    reseller = crud.get_reseller(db, reseller_id)
    if not reseller:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "reseller not found")
    return crud.archive_reseller(db, reseller)


@router.post("/{reseller_id}/unarchive", response_model=ResellerRead)
def unarchive_reseller(
    reseller_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    if not can_manage_resellers(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only superadmin can manage resellers")
    reseller = crud.get_reseller(db, reseller_id)
    if not reseller:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "reseller not found")
    return crud.unarchive_reseller(db, reseller)


@router.delete("/{reseller_id}/permanent", status_code=status.HTTP_204_NO_CONTENT)
def delete_reseller_permanently(
    reseller_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    if not can_manage_resellers(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only superadmin can manage resellers")
    reseller = crud.get_reseller(db, reseller_id)
    if not reseller:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "reseller not found")
    crud.delete_reseller(db, reseller)
