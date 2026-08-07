from sqlalchemy.orm import Session

from app.models.meter import Meter
from app.schemas.meter import MeterCreate, MeterUpdate


def get_meter_by_ats(db: Session, ats_id: str) -> Meter | None:
    return db.query(Meter).filter(Meter.ats_id == ats_id).one_or_none()


def get_meter(db: Session, meter_id: str) -> Meter | None:
    return db.get(Meter, meter_id)


def create_meter(db: Session, data: MeterCreate) -> Meter:
    meter = Meter(**data.model_dump())
    db.add(meter)
    db.commit()
    db.refresh(meter)
    return meter


def update_meter(db: Session, meter: Meter, data: MeterUpdate) -> Meter:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(meter, field, value)
    db.commit()
    db.refresh(meter)
    return meter


def delete_meter(db: Session, meter: Meter) -> None:
    db.delete(meter)
    db.commit()
