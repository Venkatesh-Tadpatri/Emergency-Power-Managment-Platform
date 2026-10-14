from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.permissions import can_view_system, can_write_system
from app.database import get_db
from app.models.monitored_asset import MonitoredAsset
from app.models.system import System
from app.models.user import User
from app.schemas.monitored_asset import MonitoredAssetCreate, MonitoredAssetRead, MonitoredAssetUpdate

router = APIRouter(prefix="/api/monitored-assets", tags=["monitored-assets"])


def allowed(db: Session, user: User, system_id: str, write: bool = False) -> System:
    system = db.get(System, system_id)
    if not system or not can_view_system(user, db, system):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "system not found")
    if write and not can_write_system(user, db, system.company_id, system.company.reseller_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not allowed to manage monitored assets")
    return system


@router.get("", response_model=list[MonitoredAssetRead])
def list_assets(system_id: str = Query(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    allowed(db, user, system_id)
    return db.query(MonitoredAsset).filter(MonitoredAsset.system_id == system_id).order_by(MonitoredAsset.asset_type, MonitoredAsset.asset_tag).all()


@router.post("", response_model=MonitoredAssetRead, status_code=status.HTTP_201_CREATED)
def create_asset(data: MonitoredAssetCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    allowed(db, user, data.system_id, True)
    duplicate = db.query(MonitoredAsset).filter(MonitoredAsset.system_id == data.system_id, MonitoredAsset.asset_tag == data.asset_tag).first()
    if duplicate:
        raise HTTPException(status.HTTP_409_CONFLICT, "asset tag already exists in this system")
    if data.panel_id and data.slot:
        occupied = db.query(MonitoredAsset).filter(MonitoredAsset.panel_id == data.panel_id, MonitoredAsset.slot == data.slot).first()
        if occupied:
            raise HTTPException(status.HTTP_409_CONFLICT, "PLC slot is already occupied")
    row = MonitoredAsset(**data.model_dump())
    if row.panel_id:
        from app.models.panel import Panel
        panel = db.get(Panel, row.panel_id)
        if not panel or panel.system_id != data.system_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "panel does not belong to this system")
        panel.sync_status = "pending"
    db.add(row); db.commit(); db.refresh(row)
    return row


@router.patch("/{asset_id}", response_model=MonitoredAssetRead)
def update_asset(asset_id: str, data: MonitoredAssetUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = db.get(MonitoredAsset, asset_id)
    if not row: raise HTTPException(status.HTTP_404_NOT_FOUND, "asset not found")
    allowed(db, user, row.system_id, True)
    values = data.model_dump(exclude_unset=True)
    for key, value in values.items(): setattr(row, key, value)
    row.status = "pending"
    if row.panel: row.panel.sync_status = "pending"
    db.commit(); db.refresh(row)
    return row


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(asset_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = db.get(MonitoredAsset, asset_id)
    if not row: raise HTTPException(status.HTTP_404_NOT_FOUND, "asset not found")
    allowed(db, user, row.system_id, True)
    if row.panel: row.panel.sync_status = "pending"
    db.delete(row); db.commit()
