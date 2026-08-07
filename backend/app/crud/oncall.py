from sqlalchemy.orm import Session

from app.models.oncall import OnCallShift
from app.schemas.oncall import OnCallShiftCreate, OnCallShiftUpdate


def list_shifts(db: Session, company_id: str) -> list[OnCallShift]:
    return (
        db.query(OnCallShift)
        .filter(OnCallShift.company_id == company_id)
        .order_by(OnCallShift.shift_date)
        .all()
    )


def get_shift(db: Session, shift_id: str) -> OnCallShift | None:
    return db.get(OnCallShift, shift_id)


def create_shift(db: Session, data: OnCallShiftCreate) -> OnCallShift:
    shift = OnCallShift(**data.model_dump())
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return shift


def update_shift(db: Session, shift: OnCallShift, data: OnCallShiftUpdate) -> OnCallShift:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(shift, field, value)
    db.commit()
    db.refresh(shift)
    return shift


def delete_shift(db: Session, shift: OnCallShift) -> None:
    db.delete(shift)
    db.commit()
