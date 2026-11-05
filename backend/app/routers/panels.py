from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.permissions import can_view_system, can_write_system
from app.crud import panel as crud
from app.crud import system as system_crud
from app.database import get_db
from app.models.user import User
from app.models.panel import Panel
from app.models.system import System
from app.models.id_sequence import IDSequence
from app.models.monitored_asset import PanelPush
from app.schemas.monitored_asset import PanelPushRead
from app.models.base import utcnow
from app.schemas.panel import PanelCreate, PanelRead, PanelUpdate

router = APIRouter(prefix="/api/panels", tags=["panels"])


def _next_panel_number(db: Session, company_id: str) -> str:
    """Allocate the next customer-wide PNUMBER without reusing gaps."""
    from app.models.company import Customer
    company = db.get(Customer, company_id)
    customer_code = "".join(character for character in (company.name if company else company_id) if character.isalnum()).upper()[:4]
    prefix = f"{customer_code}P"
    sequence_key = f"P{company_id.replace('-', '')}"[:10]
    sequence = db.query(IDSequence).filter(IDSequence.prefix == sequence_key).with_for_update().first()
    if sequence:
        number = sequence.next_value
        sequence.next_value += 1
        db.flush()
        return f"{prefix}{number:02d}"

    values = (
        db.query(Panel.panel_mqtt_id)
        .join(System, Panel.system_id == System.id)
        .filter(System.company_id == company_id, Panel.panel_mqtt_id.isnot(None))
        .all()
    )
    numbers = []
    for (value,) in values:
        if not value:
            continue
        normalized = value.upper()
        suffix = normalized[len(prefix):] if normalized.startswith(prefix) else normalized[1:] if normalized.startswith("P") else ""
        if suffix.isdigit():
            numbers.append(int(suffix))
    number = max(numbers, default=0) + 1
    db.add(IDSequence(prefix=sequence_key, next_value=number + 1))
    db.flush()
    return f"{prefix}{number:02d}"


@router.get("", response_model=list[PanelRead])
def list_panels(
    system_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    all_panels = crud.list_panels(db, system_id)
    visible_panels = [p for p in all_panels if can_view_system(user, db, p.system)]
    # Backfill PNUMBERs for panels created before automatic allocation existed.
    backfilled = False
    for panel in visible_panels:
        if not panel.panel_mqtt_id:
            panel.panel_mqtt_id = _next_panel_number(db, panel.system.company_id)
            backfilled = True
    if backfilled:
        db.commit()
    return visible_panels


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
    # PNUMBER is owned by CPC, scoped to the customer, and never entered by a user.
    data.panel_mqtt_id = _next_panel_number(db, system.company_id)
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
    if data.panel_mqtt_id is not None and data.panel_mqtt_id != panel.panel_mqtt_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "PNUMBER is permanent and cannot be changed")
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
