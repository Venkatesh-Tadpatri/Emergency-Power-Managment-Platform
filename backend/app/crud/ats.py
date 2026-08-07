from sqlalchemy.orm import Session

from app.models.ats import ATS
from app.schemas.ats import ATSCreate, ATSUpdate


def list_ats(db: Session, panel_id: str | None = None) -> list[ATS]:
    q = db.query(ATS)
    if panel_id:
        q = q.filter(ATS.panel_id == panel_id)
    return q.order_by(ATS.name).all()


def get_ats(db: Session, ats_id: str) -> ATS | None:
    return db.get(ATS, ats_id)


def create_ats(db: Session, data: ATSCreate) -> ATS:
    ats = ATS(**data.model_dump())
    db.add(ats)
    db.commit()
    db.refresh(ats)
    return ats


def update_ats(db: Session, ats: ATS, data: ATSUpdate) -> ATS:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(ats, field, value)
    db.commit()
    db.refresh(ats)
    return ats


def delete_ats(db: Session, ats: ATS) -> None:
    db.delete(ats)
    db.commit()
