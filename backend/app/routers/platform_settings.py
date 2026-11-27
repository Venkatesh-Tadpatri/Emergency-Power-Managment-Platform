"""Read-only platform configuration and integration health for superadmins.

Configuration lives in environment variables (see app/config.py), so this
endpoint reports what the running API is using and whether each integration is
reachable. Secret values (passwords, tokens, signing keys) are never returned —
only whether they are set and whether they are still the shipped defaults.
"""

import json
import urllib.error
import urllib.request

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.permissions import require_role
from app.config import Settings, settings
from app.database import get_db
from app.models.alarm import Alarm
from app.models.company import Customer
from app.models.mqtt_topic_mapping import MqttTopicMapping
from app.models.reseller import Reseller
from app.models.site import Site
from app.models.system import System
from app.models.user import User
from app.services import panel_limits
from app.services.telemetry import telemetry_bridge

router = APIRouter(prefix="/api/settings", tags=["settings"])


class PanelLimits(BaseModel):
    generator: int
    ats: int
    meter: int
    fuel_tank: int


def _panel_limits_payload(db: Session) -> dict:
    row = db.get(panel_limits.PlatformSetting, panel_limits.SETTING_KEY)
    return {
        "limits": panel_limits.get_limits(db),
        "defaults": panel_limits.DEFAULT_LIMITS,
        "max": panel_limits.MAX_LIMITS,
        "in_use": panel_limits.usage_max(db),
        "updated_by": row.updated_by if row else None,
        "updated_at": row.updated_at.isoformat() if row and row.updated_at else None,
    }


@router.get("/panel-limits")
def get_panel_limits(db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    """Any signed-in user may read the limits — Device Administration needs them."""
    return _panel_limits_payload(db)


@router.put("/panel-limits")
def update_panel_limits(
    data: PanelLimits,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("superadmin")),
):
    values = data.model_dump()
    for key, value in values.items():
        upper = panel_limits.MAX_LIMITS[key]
        if not 1 <= value <= upper:
            label = panel_limits.LABELS[key]
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"The {label} limit must be between 1 and {upper}.")
    panel_limits.save_limits(db, values, user.display_name or user.email)
    return _panel_limits_payload(db)

_DEFAULTS = Settings.model_fields


def _is_default(name: str) -> bool:
    return getattr(settings, name) == _DEFAULTS[name].default


def _influx_health() -> dict:
    try:
        with urllib.request.urlopen(f"{settings.influxdb_url.rstrip('/')}/health", timeout=2) as response:
            body = json.loads(response.read().decode() or "{}")
            return {"reachable": True, "status": body.get("status"), "version": body.get("version"), "error": None}
    except (urllib.error.URLError, OSError, ValueError) as exc:
        return {"reachable": False, "status": None, "version": None, "error": str(getattr(exc, "reason", exc))}


@router.get("/overview")
def settings_overview(
    db: Session = Depends(get_db),
    _user: User = Depends(require_role("superadmin")),
):
    def count(model, *criteria) -> int:
        return db.query(func.count(model.id)).filter(*criteria).scalar() or 0

    users_by_role = dict(db.query(User.role, func.count(User.id)).group_by(User.role).all())

    warnings: list[str] = []
    if settings.local_auth_enabled and _is_default("local_auth_secret"):
        warnings.append("LOCAL_AUTH_SECRET is still the default value — set a unique secret before production.")
    if _is_default("influxdb_token"):
        warnings.append("INFLUXDB_TOKEN is still the development default token.")
    if not settings.smtp_host:
        warnings.append("SMTP is not configured — login OTP codes and alert emails are only written to the server log.")
    if not settings.mqtt_enabled:
        warnings.append("MQTT ingestion is disabled (MQTT_ENABLED=false) — no live telemetry will arrive.")
    elif not settings.mqtt_tls:
        warnings.append("MQTT is connecting without TLS.")
    if settings.seed_on_start:
        warnings.append("SEED_ON_START is enabled — demo data is seeded when the API starts.")

    return {
        "app": {"name": "Critical Power Command", "api_version": "0.1.0"},
        "warnings": warnings,
        "inventory": {
            "resellers": count(Reseller, Reseller.status != "archived"),
            "customers": count(Customer, Customer.status != "archived"),
            "sites": count(Site, Site.status != "archived"),
            "systems": count(System, System.archived.is_(False)),
            "active_alarms": count(Alarm, Alarm.status == "active"),
        },
        "users": {
            "total": sum(users_by_role.values()),
            "unassigned": users_by_role.get(None, 0),
            "by_role": {role: total for role, total in users_by_role.items() if role},
        },
        "mqtt": {
            "enabled": settings.mqtt_enabled,
            "host": settings.mqtt_host,
            "port": settings.mqtt_port,
            "tls": settings.mqtt_tls,
            "topic_filter": settings.mqtt_topic_filter,
            "auth_configured": bool(settings.mqtt_username),
            "connected": telemetry_bridge.connected,
            "last_message_topic": telemetry_bridge.last_message_topic,
            "last_error": telemetry_bridge.last_error,
            "topic_mappings": count(MqttTopicMapping, MqttTopicMapping.enabled.is_(True)),
            "sample_interval_seconds": settings.telemetry_sample_interval_seconds,
        },
        "influxdb": {
            "url": settings.influxdb_url,
            "org": settings.influxdb_org,
            "bucket": settings.influxdb_bucket,
            "token_configured": bool(settings.influxdb_token),
            "token_is_default": _is_default("influxdb_token"),
            **_influx_health(),
        },
        "auth": {
            "local_auth_enabled": settings.local_auth_enabled,
            "local_secret_is_default": _is_default("local_auth_secret"),
            "zitadel_issuers": list(dict.fromkeys(settings.zitadel_issuer_list)),
            "zitadel_client_configured": bool(settings.zitadel_client_id),
            "access_token_minutes": settings.access_token_minutes,
            "otp_expiry_minutes": settings.otp_expiry_minutes,
            "otp_resend_cooldown_seconds": settings.otp_resend_cooldown_seconds,
            "otp_max_attempts": settings.otp_max_attempts,
            "login_max_attempts": settings.login_max_attempts,
            "login_lockout_minutes": settings.login_lockout_minutes,
        },
        "email": {
            "configured": bool(settings.smtp_host),
            "host": settings.smtp_host or None,
            "port": settings.smtp_port,
            "from_email": settings.smtp_from_email,
            "starttls": settings.smtp_starttls,
            "auth_configured": bool(settings.smtp_username),
        },
        "logging": {
            "level": settings.log_level,
            "directory": settings.log_dir,
            "retention_days": settings.log_retention_days,
        },
        "network": {
            "cors_origins": settings.cors_origin_list,
            "seed_on_start": settings.seed_on_start,
        },
    }
