"""Equipment notes shared by every user who can view the system.

- View: anyone who can view the system (Super Admin, Reseller Admin, Customer Admin, System Operator,
  System Viewer — each within their own scope).
- Add: the same users, except System Viewer, which is read-only.
- Delete: the note's author, or a Super Admin.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.permissions import can_view_system
from app.crud import system as system_crud
from app.database import get_db
from app.models.equipment_note import EquipmentNote
from app.models.system import System
from app.models.user import User
from app.schemas.equipment_note import EquipmentNoteCreate, EquipmentNoteRead

router = APIRouter(prefix="/api/systems", tags=["equipment-notes"])

READ_ONLY_ROLES = {"system_viewer"}


def _viewable_system(db: Session, user: User, system_id: str) -> System:
    system = system_crud.get_system(db, system_id)
    if not system or not can_view_system(user, db, system):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "system not found")
    return system


def _can_delete(user: User, note: EquipmentNote) -> bool:
    return user.role == "superadmin" or (note.author_id is not None and note.author_id == user.id)


def _read(user: User, note: EquipmentNote) -> EquipmentNoteRead:
    result = EquipmentNoteRead.model_validate(note)
    result.can_delete = _can_delete(user, note)
    return result


@router.get("/{system_id}/equipment-notes", response_model=list[EquipmentNoteRead])
def list_equipment_notes(
    system_id: str,
    record_key: str = Query(min_length=1, max_length=255),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _viewable_system(db, user, system_id)
    notes = (
        db.query(EquipmentNote)
        .filter(EquipmentNote.system_id == system_id, EquipmentNote.record_key == record_key)
        .order_by(EquipmentNote.created_at, EquipmentNote.id)
        .all()
    )
    return [_read(user, note) for note in notes]


@router.post("/{system_id}/equipment-notes", response_model=EquipmentNoteRead, status_code=status.HTTP_201_CREATED)
def create_equipment_note(
    system_id: str,
    payload: EquipmentNoteCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _viewable_system(db, user, system_id)
    if user.role is None or user.role in READ_ONLY_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "your role can view notes but not add them")
    text = payload.text.strip()
    if not text:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "note text is required")
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    created_at = now
    if payload.created_at is not None:
        original = payload.created_at
        if original.tzinfo is not None:
            original = original.astimezone(timezone.utc).replace(tzinfo=None)
        if original <= now:
            created_at = original
    note = EquipmentNote(
        system_id=system_id,
        record_key=payload.record_key,
        text=text,
        author_id=user.id,
        author_name=user.display_name or user.email,
        author_email=user.email,
        author_role=user.role,
        created_at=created_at,
        updated_at=now,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return _read(user, note)


@router.delete("/{system_id}/equipment-notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_equipment_note(
    system_id: str,
    note_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _viewable_system(db, user, system_id)
    note = db.get(EquipmentNote, note_id)
    if not note or note.system_id != system_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "note not found")
    if not _can_delete(user, note):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only the note's author or a Super Admin can remove it")
    db.delete(note)
    db.commit()
