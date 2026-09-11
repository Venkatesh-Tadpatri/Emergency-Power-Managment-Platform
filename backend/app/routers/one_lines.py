from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.permissions import can_view_system, can_write_system
from app.crud import one_line as crud
from app.crud import system as system_crud
from app.database import get_db
from app.models.user import User
from app.schemas.one_line import OneLineRead, OneLineUpsert

router = APIRouter(prefix="/api/systems", tags=["one-line"])


@router.get("/{system_id}/one-line", response_model=OneLineRead | None)
def get_one_line(
    system_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    system = system_crud.get_system(db, system_id)
    if not system or not can_view_system(user, db, system):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "system not found")
    return crud.get_one_line(db, system_id)


@router.put("/{system_id}/one-line", response_model=OneLineRead)
def save_one_line(
    system_id: str,
    payload: OneLineUpsert,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    system = system_crud.get_system(db, system_id)
    if not system:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "system not found")
    if not can_write_system(user, db, system.company_id, system.company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to edit this system's one-line")
    return crud.upsert_one_line(db, system_id, payload.data)
