"""Email notifications when a user is given access to sites, systems or equipment.

Recipients:
- the user who received the access, and
- their higher-level team in the organisational hierarchy: the customer's Customer Admins and the
  reseller's Reseller Admin (active accounts only).

Each email names the customer, the sites/systems granted, the access level, who assigned it, and
when. Messages are built inside the request (so they reflect exactly what was saved) and delivered
on a background thread, so a slow or failing mail server never blocks or fails the access change.
"""

import logging
import threading
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.config import settings
from app.models.company import Customer
from app.models.site import Site
from app.models.system import System
from app.models.user import User
from app.services.email import EmailContent, EmailDeliveryError, login_url, send_email

logger = logging.getLogger(__name__)

ROLE_LABELS = {
    "superadmin": "Super Admin",
    "reseller_admin": "Reseller Admin",
    "company_admin": "Customer Admin",
    "system_operator": "System Operator",
    "system_viewer": "System Viewer",
}

Message = tuple[str, EmailContent]


def role_label(role: str | None) -> str:
    return ROLE_LABELS.get(role or "", (role or "No role").replace("_", " ").title())


def person(user: User) -> str:
    return user.display_name or user.email


def format_time(moment: datetime) -> str:
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    local = moment.astimezone(timezone(timedelta(minutes=settings.notification_utc_offset_minutes)))
    return f"{local.strftime('%d %b %Y, %I:%M %p')} {settings.notification_timezone_label}"


def hierarchy_recipients(db: Session, company: Customer, exclude_user_id: str) -> list[User]:
    """The user's higher-level team: this customer's Customer Admins and its reseller's Reseller Admin."""
    candidates = (
        db.query(User)
        .filter(
            User.is_active.is_(True),
            User.account_state == "active",
            ((User.role == "company_admin") & (User.company_id == company.id))
            | ((User.role == "reseller_admin") & (User.reseller_id == company.reseller_id)),
        )
        .all()
    )
    seen: set[str] = set()
    result = []
    for user in candidates:
        if user.id == exclude_user_id or not user.email or user.email.lower() in seen:
            continue
        seen.add(user.email.lower())
        result.append(user)
    return result


def _messages(
    db: Session,
    target: User,
    company: Customer,
    assigner: User,
    granted: list[tuple[str, str]],
    assigned_at: datetime,
) -> list[Message]:
    when = format_time(assigned_at)
    by = f"{person(assigner)} ({role_label(assigner.role)})"
    details = [("Customer", company.name), *granted, ("Access level", role_label(target.role)), ("Assigned by", by), ("Assigned on", when)]
    messages: list[Message] = []
    if target.email:
        messages.append((target.email, EmailContent(
            subject="You have been given new access in CPC",
            greeting_name=target.display_name,
            intro=[f"{by} has given you access to the following in Critical Power Command (CPC)."],
            details=details,
            button=("Open CPC", login_url()),
            notes=["If you believe this access was given to you by mistake, contact your administrator."],
        )))
    for member in hierarchy_recipients(db, company, target.id):
        messages.append((member.email, EmailContent(
            subject=f"Access granted to {person(target)} in CPC",
            greeting_name=member.display_name,
            intro=[f"{person(target)} ({target.email}) has been given new access under {company.name} by {by}. You are receiving this as part of their reporting hierarchy."],
            details=[("User", f"{person(target)} ({target.email})"), *details],
            button=("Open CPC", login_url()),
        )))
    return messages


def assignment_messages(
    db: Session,
    target: User,
    company: Customer,
    assigner: User,
    new_site_ids: set[str],
    new_system_ids: set[str],
    assigned_at: datetime,
) -> list[Message]:
    """Emails for sites/systems newly added to a user's 'selected sites and systems' access."""
    if not new_site_ids and not new_system_ids:
        return []
    granted: list[tuple[str, str]] = []
    sites = db.query(Site).filter(Site.id.in_(new_site_ids)).order_by(Site.name).all() if new_site_ids else []
    if sites:
        granted.append(("Sites (all systems)", ", ".join(site.name for site in sites)))
    systems = db.query(System).filter(System.id.in_(new_system_ids)).order_by(System.name).all() if new_system_ids else []
    if systems:
        site_names = {site.id: site.name for site in db.query(Site).filter(Site.id.in_({s.site_id for s in systems}))}
        granted.append(("Systems", ", ".join(
            f"{system.name} ({site_names[system.site_id]})" if system.site_id in site_names else system.name for system in systems
        )))
    return _messages(db, target, company, assigner, granted, assigned_at)


def customer_wide_messages(db: Session, target: User, company: Customer, assigner: User, assigned_at: datetime) -> list[Message]:
    """Emails for access that covers every site and system of the customer."""
    site_names = [site.name for site in db.query(Site).filter(Site.customer_id == company.id, Site.status != "archived").order_by(Site.name)]
    granted = [("Sites", f"All sites of {company.name}" + (f": {', '.join(site_names)}" if site_names else ""))]
    return _messages(db, target, company, assigner, granted, assigned_at)


def _deliver(messages: list[Message]) -> None:
    for to, content in messages:
        try:
            send_email(to, content)
        except EmailDeliveryError:
            logger.warning("Access notification to %s could not be delivered", to)
        except Exception:  # never let a notification failure escape the worker thread silently
            logger.exception("Unexpected error sending access notification to %s", to)


def dispatch(messages: list[Message]) -> None:
    """Send in the background so the API response never waits on SMTP."""
    if not messages:
        return
    threading.Thread(target=_deliver, args=(messages,), daemon=True, name="access-notifications").start()
