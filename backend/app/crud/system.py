from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.system import System
from app.models.site import Site
from app.schemas.system import SystemCreate, SystemUpdate


def list_systems(db: Session, company_id: str | None = None, site_id: str | None = None, include_archived: bool = False) -> list[System]:
    q = db.query(System)
    if not include_archived:
        q = q.filter(System.archived.is_(False))
    if company_id:
        q = q.filter(System.company_id == company_id)
    if site_id:
        q = q.filter(System.site_id == site_id)
    return q.order_by(System.name).all()


def get_system(db: Session, system_id: str) -> System | None:
    return db.get(System, system_id)


def get_system_by_name(db: Session, site_id: str, name: str, exclude_id: str | None = None) -> System | None:
    query = db.query(System).filter(
        System.site_id == site_id,
        func.lower(func.trim(System.name)) == name.strip().lower(),
    )
    if exclude_id:
        query = query.filter(System.id != exclude_id)
    return query.first()


def create_system(db: Session, data: SystemCreate) -> System:
    values = data.model_dump()
    # Until dedicated Site management is exposed, creating a system from the
    # existing screen also creates its containing site. This keeps the required
    # Customer -> Site -> System hierarchy intact.
    if not values.get("site_id"):
        site = Site(
            name=f"{values['name']} Site",
            address=values.get("address"),
            lat=values.get("lat"),
            lng=values.get("lng"),
            customer_id=values["company_id"],
        )
        db.add(site)
        db.flush()
        values["site_id"] = site.id
    system = System(**values)
    db.add(system)
    db.commit()
    db.refresh(system)
    return system


def update_system(db: Session, system: System, data: SystemUpdate) -> System:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(system, field, value)
    db.commit()
    db.refresh(system)
    return system


def archive_system(db: Session, system: System) -> System:
    system.status = "offline"
    system.archived = True
    db.commit()
    db.refresh(system)
    return system


def unarchive_system(db: Session, system: System) -> System:
    system.archived = False
    system.status = "normal"
    db.commit()
    db.refresh(system)
    return system


def delete_system(db: Session, system: System) -> None:
    from app.models.alarm import Alarm
    from app.models.monitored_asset import MonitoredAsset
    from app.models.mqtt_topic_mapping import MqttTopicMapping
    from app.models.one_line import OneLine
    from app.models.report import Report
    from app.models.system import SystemEvent
    from app.models.user import UserAssignedSystem

    system_id = system.id
    db.query(UserAssignedSystem).filter(UserAssignedSystem.system_id == system_id).delete(synchronize_session=False)
    db.query(Alarm).filter(Alarm.system_id == system_id).delete(synchronize_session=False)
    db.query(Report).filter(Report.system_id == system_id).delete(synchronize_session=False)
    db.query(OneLine).filter(OneLine.system_id == system_id).delete(synchronize_session=False)
    db.query(SystemEvent).filter(SystemEvent.system_id == system_id).delete(synchronize_session=False)
    db.query(MqttTopicMapping).filter(MqttTopicMapping.system_id == system_id).delete(synchronize_session=False)
    db.query(MonitoredAsset).filter(MonitoredAsset.system_id == system_id).delete(synchronize_session=False)
    db.delete(system)
    db.commit()
