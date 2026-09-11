from sqlalchemy.orm import Session

from app.models.one_line import OneLine


def get_one_line(db: Session, system_id: str) -> OneLine | None:
    return db.query(OneLine).filter(OneLine.system_id == system_id).first()


def upsert_one_line(db: Session, system_id: str, data: dict) -> OneLine:
    existing = get_one_line(db, system_id)
    if existing:
        existing.data = data
        db.commit()
        db.refresh(existing)
        return existing
    # id is left unset — the shared before_insert listener (app/models/base.py) assigns a readable
    # OLN-0001-style id, same convention every other table uses, instead of a raw UUID.
    one_line = OneLine(system_id=system_id, data=data)
    db.add(one_line)
    db.commit()
    db.refresh(one_line)
    return one_line
