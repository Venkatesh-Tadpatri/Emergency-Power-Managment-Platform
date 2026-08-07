from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.permissions import can_view_system, can_write_system
from app.crud import generator as crud
from app.crud import panel as panel_crud
from app.database import get_db
from app.models.user import User
from app.schemas.generator import GeneratorCreate, GeneratorRead, GeneratorUpdate

router = APIRouter(prefix="/api/generators", tags=["generators"])


@router.get("", response_model=list[GeneratorRead])
def list_generators(
    panel_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    all_gens = crud.list_generators(db, panel_id)
    return [g for g in all_gens if can_view_system(user, db, g.panel.system)]


@router.post("", response_model=GeneratorRead, status_code=status.HTTP_201_CREATED)
def create_generator(
    data: GeneratorCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    panel = panel_crud.get_panel(db, data.panel_id)
    if not panel:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "panel not found")
    if not can_write_system(user, db, panel.system.company_id, panel.system.company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to add generators here")
    return crud.create_generator(db, data)


@router.get("/{generator_id}", response_model=GeneratorRead)
def get_generator(
    generator_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    generator = crud.get_generator(db, generator_id)
    if not generator or not can_view_system(user, db, generator.panel.system):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "generator not found")
    return generator


@router.patch("/{generator_id}", response_model=GeneratorRead)
def update_generator(
    generator_id: str,
    data: GeneratorUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    generator = crud.get_generator(db, generator_id)
    if not generator:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "generator not found")
    system = generator.panel.system
    if not can_write_system(user, db, system.company_id, system.company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to edit this generator")
    return crud.update_generator(db, generator, data)


@router.delete("/{generator_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_generator(
    generator_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    generator = crud.get_generator(db, generator_id)
    if not generator:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "generator not found")
    system = generator.panel.system
    if not can_write_system(user, db, system.company_id, system.company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to delete this generator")
    crud.delete_generator(db, generator)
