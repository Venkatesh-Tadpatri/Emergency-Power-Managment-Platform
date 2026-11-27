import logging
import threading
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.auth.permissions import can_view_system
from app.config import settings
from app.database import SessionLocal
from app.models.asset_alarm_disable import AssetAlarmDisable
from app.models.base import utcnow
from app.models.equipment_note import EquipmentNote
from app.models.system import System, SystemEvent
from app.models.user import User
from app.services.email import alarm_disable_reminder_email, send_email

logger = logging.getLogger(__name__)
CONTROL_ROLES = {"superadmin", "reseller_admin", "company_admin", "system_operator"}
DURATION_HOURS = {"1h": 1, "4h": 4, "8h": 8, "24h": 24}


def ensure_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def can_control_alarms(user: User, db: Session, system: System) -> bool:
    return user.role in CONTROL_ROLES and can_view_system(user, db, system)


def status_payload(system: System, can_control: bool = False) -> dict:
    return {
        "disabled": system.alarms_disabled,
        "disabled_at": system.alarms_disabled_at,
        "disabled_until": system.alarms_disabled_until,
        "indefinite": system.alarms_disabled_indefinitely,
        "reason": system.alarms_disabled_reason,
        "disabled_by_name": system.alarms_disabled_by_name,
        "disabled_by_email": system.alarms_disabled_by_email,
        "can_control": can_control,
    }


def add_event(db: Session, system: System, event_type: str, message: str, user: User | None = None, reason: str | None = None) -> SystemEvent:
    event = SystemEvent(
        system_id=system.id,
        event_type=event_type,
        message=message,
        occurred_at=utcnow(),
        actor_user_id=user.id if user else None,
        actor_name=(user.display_name or user.email) if user else "System",
        reason=reason,
    )
    db.add(event)
    return event


def disable_alarms(db: Session, system: System, user: User, duration: str, reason: str) -> dict:
    now = utcnow()
    indefinite = duration == "indefinite"
    until = None if indefinite else now + timedelta(hours=DURATION_HOURS[duration])
    actor = user.display_name or user.email
    system.alarms_disabled = True
    system.alarms_disabled_at = now
    system.alarms_disabled_until = until
    system.alarms_disabled_indefinitely = indefinite
    system.alarms_disabled_reason = reason.strip()
    system.alarms_disabled_by_user_id = user.id
    system.alarms_disabled_by_name = actor
    system.alarms_disabled_by_email = user.email
    # For indefinite suppressions, the first reminder is due 24 hours after this timestamp.
    system.alarms_reminder_sent_at = now if indefinite else None
    end_text = "until manually re-enabled" if indefinite else f"until {until.isoformat()}"
    add_event(db, system, "alarms_disabled", f"Alarms disabled by {actor} {end_text}. Reason: {reason.strip()}", user, reason.strip())
    db.commit()
    db.refresh(system)
    logger.warning("Alarms disabled system_id=%s actor=%s duration=%s reason=%s", system.id, actor, duration, reason.strip())
    return status_payload(system, True)


def enable_alarms(db: Session, system: System, user: User | None = None, automatic: bool = False) -> dict:
    if not system.alarms_disabled:
        return status_payload(system, bool(user))
    actor = "System" if automatic else (user.display_name or user.email if user else "System")
    reason = system.alarms_disabled_reason
    add_event(db, system, "alarms_enabled", f"Alarms re-enabled {'automatically after the disable period ended' if automatic else f'by {actor}' }.", user, reason)
    system.alarms_disabled = False
    system.alarms_disabled_at = None
    system.alarms_disabled_until = None
    system.alarms_disabled_indefinitely = False
    system.alarms_disabled_reason = None
    system.alarms_disabled_by_user_id = None
    system.alarms_disabled_by_name = None
    system.alarms_disabled_by_email = None
    system.alarms_reminder_sent_at = None
    db.commit()
    db.refresh(system)
    logger.warning("Alarms re-enabled system_id=%s actor=%s automatic=%s", system.id, actor, automatic)
    return status_payload(system, bool(user))


def asset_payload(row: AssetAlarmDisable) -> dict:
    return {
        "record_key": row.record_key,
        "asset_name": row.asset_name,
        "disabled": True,
        "disabled_at": row.disabled_at,
        "disabled_until": row.disabled_until,
        "indefinite": row.indefinite,
        "reason": row.reason,
        "disabled_by_name": row.disabled_by_name,
        "disabled_by_email": row.disabled_by_email,
    }


def add_asset_note(db: Session, system: System, record_key: str, text: str, user: User | None = None) -> EquipmentNote:
    """Record the change on the asset's own Notes tab (same record_key the popup reads)."""
    now = utcnow()
    note = EquipmentNote(
        system_id=system.id,
        record_key=record_key,
        text=text,
        author_id=user.id if user else None,
        author_name=(user.display_name or user.email) if user else "System",
        author_email=user.email if user else None,
        author_role=user.role if user else None,
        created_at=now,
        updated_at=now,
    )
    db.add(note)
    return note


def disable_asset_alarms(db: Session, system: System, user: User, record_key: str, asset_name: str, duration: str, reason: str) -> dict:
    now = utcnow()
    indefinite = duration == "indefinite"
    until = None if indefinite else now + timedelta(hours=DURATION_HOURS[duration])
    actor = user.display_name or user.email
    reason = reason.strip()
    row = db.query(AssetAlarmDisable).filter(AssetAlarmDisable.system_id == system.id, AssetAlarmDisable.record_key == record_key).one_or_none()
    if row is None:
        row = AssetAlarmDisable(system_id=system.id, record_key=record_key)
        db.add(row)
    row.asset_name = asset_name
    row.disabled_at = now
    row.disabled_until = until
    row.indefinite = indefinite
    row.reason = reason
    row.disabled_by_user_id = user.id
    row.disabled_by_name = actor
    row.disabled_by_email = user.email
    # For indefinite suppressions, the first reminder is due 24 hours after this timestamp.
    row.reminder_sent_at = now if indefinite else None
    end_text = "until manually re-enabled" if indefinite else f"until {until.isoformat(timespec='minutes')} UTC"
    message = f"Alarms disabled for {asset_name} by {actor} {end_text}. Reason: {reason}"
    add_event(db, system, "asset_alarms_disabled", message, user, reason)
    add_asset_note(db, system, record_key, message, user)
    db.commit()
    db.refresh(row)
    logger.warning("Asset alarms disabled system_id=%s asset=%s actor=%s duration=%s reason=%s", system.id, record_key, actor, duration, reason)
    return asset_payload(row)


def enable_asset_alarms(db: Session, system: System, row: AssetAlarmDisable, user: User | None = None, automatic: bool = False) -> None:
    actor = "System" if automatic else (user.display_name or user.email if user else "System")
    how = "automatically after the disable period ended" if automatic else f"by {actor}"
    message = f"Alarms re-enabled for {row.asset_name} {how}."
    add_event(db, system, "asset_alarms_enabled", message, None if automatic else user, row.reason)
    add_asset_note(db, system, row.record_key, message, None if automatic else user)
    db.delete(row)
    db.commit()
    logger.warning("Asset alarms re-enabled system_id=%s asset=%s actor=%s automatic=%s", system.id, row.record_key, actor, automatic)


def expire_asset_disables(db: Session, system: System) -> None:
    """Re-enable any of this system's asset suppressions whose period has ended."""
    now = datetime.now(timezone.utc)
    rows = db.query(AssetAlarmDisable).filter(AssetAlarmDisable.system_id == system.id).all()
    for row in rows:
        until = ensure_utc(row.disabled_until)
        if until and until <= now:
            enable_asset_alarms(db, system, row, automatic=True)


def control_recipients(db: Session, system: System) -> list[str]:
    recipients = []
    for user in db.query(User).filter(User.is_active.is_(True), User.role.in_(CONTROL_ROLES)).all():
        if user.email and can_view_system(user, db, system):
            recipients.append(user.email)
    return sorted(set(recipients))


def send_reminder(system: System, recipients: list[str], asset: AssetAlarmDisable | None = None) -> bool:
    if not recipients:
        return True
    if not settings.smtp_host:
        logger.warning("Alarm-disable reminder email not sent; SMTP is not configured system_id=%s recipients=%s", system.id, recipients)
        return False
    disabled_at = ensure_utc(asset.disabled_at if asset else system.alarms_disabled_at)
    content = alarm_disable_reminder_email(
        f"{system.name} — {asset.asset_name}" if asset else system.name,
        (asset.disabled_by_name or asset.disabled_by_email) if asset else (system.alarms_disabled_by_name or system.alarms_disabled_by_email),
        disabled_at.strftime("%d %b %Y, %H:%M UTC") if disabled_at else "Unknown",
        asset.reason if asset else system.alarms_disabled_reason,
    )
    return send_email(recipients, content)


class AlarmDisableWorker:
    def __init__(self) -> None:
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="alarm-disable-worker", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)

    def _run(self) -> None:
        while not self._stop.wait(60):
            db = SessionLocal()
            try:
                now = datetime.now(timezone.utc)
                systems = db.query(System).filter(System.alarms_disabled.is_(True)).all()
                for system in systems:
                    until = ensure_utc(system.alarms_disabled_until)
                    if until and until <= now:
                        enable_alarms(db, system, automatic=True)
                        continue
                    last_reminder = ensure_utc(system.alarms_reminder_sent_at or system.alarms_disabled_at)
                    if system.alarms_disabled_indefinitely and last_reminder and last_reminder + timedelta(hours=24) <= now:
                        try:
                            if send_reminder(system, control_recipients(db, system)):
                                system.alarms_reminder_sent_at = utcnow()
                                db.commit()
                        except Exception:
                            db.rollback()
                            logger.exception("Alarm-disable reminder failed system_id=%s", system.id)
                self._run_assets(db, now)
            except Exception:
                db.rollback()
                logger.exception("Alarm-disable worker cycle failed")
            finally:
                db.close()

    @staticmethod
    def _run_assets(db: Session, now: datetime) -> None:
        for row in db.query(AssetAlarmDisable).all():
            system = db.get(System, row.system_id)
            if system is None:
                continue
            until = ensure_utc(row.disabled_until)
            if until and until <= now:
                enable_asset_alarms(db, system, row, automatic=True)
                continue
            last_reminder = ensure_utc(row.reminder_sent_at or row.disabled_at)
            if row.indefinite and last_reminder and last_reminder + timedelta(hours=24) <= now:
                try:
                    if send_reminder(system, control_recipients(db, system), row):
                        row.reminder_sent_at = utcnow()
                        db.commit()
                except Exception:
                    db.rollback()
                    logger.exception("Asset alarm-disable reminder failed system_id=%s asset=%s", system.id, row.record_key)


alarm_disable_worker = AlarmDisableWorker()
