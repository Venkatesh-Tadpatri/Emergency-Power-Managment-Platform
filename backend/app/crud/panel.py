from sqlalchemy.orm import Session

from app.models.panel import Panel
from app.schemas.panel import PanelCreate, PanelUpdate


def list_panels(db: Session, system_id: str | None = None) -> list[Panel]:
    q = db.query(Panel)
    if system_id:
        q = q.filter(Panel.system_id == system_id)
    return q.order_by(Panel.name).all()


def get_panel(db: Session, panel_id: str) -> Panel | None:
    return db.get(Panel, panel_id)


def create_panel(db: Session, data: PanelCreate) -> Panel:
    panel = Panel(**data.model_dump())
    db.add(panel)
    db.commit()
    db.refresh(panel)
    return panel


def update_panel(db: Session, panel: Panel, data: PanelUpdate) -> Panel:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(panel, field, value)
    db.commit()
    db.refresh(panel)
    return panel


def delete_panel(db: Session, panel: Panel) -> None:
    db.delete(panel)
    db.commit()
