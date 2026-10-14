from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.permissions import can_view_system, can_write_system
from app.crud import panel as crud
from app.crud import system as system_crud
from app.database import get_db
from app.models.user import User
from app.models.panel import Panel
from app.models.monitored_asset import PanelPush
from app.schemas.monitored_asset import PanelPushRead
from app.models.base import utcnow
from app.schemas.panel import PanelCreate, PanelRead, PanelUpdate

router = APIRouter(prefix="/api/panels", tags=["panels"])


@router.get("", response_model=list[PanelRead])
def list_panels(
    system_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    all_panels = crud.list_panels(db, system_id)
    return [p for p in all_panels if can_view_system(user, db, p.system)]


@router.post("", response_model=PanelRead, status_code=status.HTTP_201_CREATED)
def create_panel(
    data: PanelCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    system = system_crud.get_system(db, data.system_id)
    if not system:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "system not found")
    if not can_write_system(user, db, system.company_id, system.company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to add panels here")
    duplicate = db.query(Panel).filter(Panel.system_id == data.system_id, Panel.panel_mqtt_id == data.panel_mqtt_id).first()
    if duplicate:
        raise HTTPException(status.HTTP_409_CONFLICT, "panel number already exists in this system")
    return crud.create_panel(db, data)


@router.get("/{panel_id}", response_model=PanelRead)
def get_panel(
    panel_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    panel = crud.get_panel(db, panel_id)
    if not panel or not can_view_system(user, db, panel.system):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "panel not found")
    return panel


@router.patch("/{panel_id}", response_model=PanelRead)
def update_panel(
    panel_id: str,
    data: PanelUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    panel = crud.get_panel(db, panel_id)
    if not panel:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "panel not found")
    if not can_write_system(user, db, panel.system.company_id, panel.system.company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to edit this panel")
    if data.panel_mqtt_id:
        duplicate = db.query(Panel).filter(Panel.system_id == panel.system_id, Panel.panel_mqtt_id == data.panel_mqtt_id, Panel.id != panel.id).first()
        if duplicate:
            raise HTTPException(status.HTTP_409_CONFLICT, "panel number already exists in this system")
    return crud.update_panel(db, panel, data)


@router.delete("/{panel_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_panel(
    panel_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    panel = crud.get_panel(db, panel_id)
    if not panel:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "panel not found")
    if not can_write_system(user, db, panel.system.company_id, panel.system.company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to delete this panel")
    crud.delete_panel(db, panel)


@router.post("/{panel_id}/push", response_model=PanelPushRead)
def push_panel(panel_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    panel = crud.get_panel(db, panel_id)
    if not panel: raise HTTPException(status.HTTP_404_NOT_FOUND, "panel not found")
    if not can_write_system(user, db, panel.system.company_id, panel.system.company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to push this panel")
    assets = list(panel.monitored_assets)
    slots = ", ".join(a.slot for a in assets if a.slot) or "no assigned slots"
    push = PanelPush(panel_id=panel.id, pushed_at=utcnow(), pushed_by=user.display_name or user.email, summary=f"{len(assets)} assets active — {slots}", status="confirmed")
    panel.sync_status = "in_sync"
    for asset in assets: asset.status = "monitored" if asset.panel_id else "details_only"
    db.add(push); db.commit(); db.refresh(push)
    return push


@router.get("/system/{system_id}/push-history", response_model=list[PanelPushRead])
def push_history(system_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    system = system_crud.get_system(db, system_id)
    if not system or not can_view_system(user, db, system): raise HTTPException(status.HTTP_404_NOT_FOUND, "system not found")
    return db.query(PanelPush).join(PanelPush.panel).filter_by(system_id=system_id).order_by(PanelPush.pushed_at.desc()).all()
