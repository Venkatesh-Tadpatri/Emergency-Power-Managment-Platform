"""Per-panel device limits (generators, ATS units, power meters, fuel tanks).

The limits are edited by superadmins on the Settings page and stored in the
``platform_settings`` table under ``panel_device_limits``. Every endpoint that
places a device on a PLC panel checks them here, so the rule holds no matter
which screen (Device Administration, Device Manager, One-Line) adds the device.

Slots are named by type prefix and position: G1..Gn, A1..An, M1..Mn, F1..Fn.
"""

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.ats import ATS
from app.models.generator import Generator
from app.models.monitored_asset import MonitoredAsset
from app.models.platform_setting import PlatformSetting

__all__ = ["PlatformSetting", "get_limits", "save_limits", "usage_max", "enforce_panel_limit"]

SETTING_KEY = "panel_device_limits"
DEFAULT_LIMITS: dict[str, int] = {"generator": 1, "ats": 4, "meter": 4, "fuel_tank": 1}
# Settings accepts at most two digits per limit. Note: the PLC's ASET/GSET/FSET
# setup words are 16-bit, so firmware must support any slots beyond 16.
MAX_LIMITS: dict[str, int] = {"generator": 99, "ats": 99, "meter": 99, "fuel_tank": 99}
SLOT_PREFIX: dict[str, str] = {"generator": "G", "ats": "A", "meter": "M", "fuel_tank": "F"}
LABELS: dict[str, str] = {"generator": "generator", "ats": "ATS", "meter": "power meter", "fuel_tank": "fuel tank"}


def get_limits(db: Session) -> dict[str, int]:
    row = db.get(PlatformSetting, SETTING_KEY)
    stored = row.value if row and isinstance(row.value, dict) else {}
    limits = dict(DEFAULT_LIMITS)
    for key in DEFAULT_LIMITS:
        value = stored.get(key)
        if isinstance(value, int) and value >= 1:
            limits[key] = value
    return limits


def save_limits(db: Session, limits: dict[str, int], updated_by: str | None) -> PlatformSetting:
    row = db.get(PlatformSetting, SETTING_KEY)
    if row is None:
        row = PlatformSetting(key=SETTING_KEY, value=limits, updated_by=updated_by)
        db.add(row)
    else:
        row.value = dict(limits)  # new object so SQLAlchemy detects the JSON change
        row.updated_by = updated_by
    db.commit()
    db.refresh(row)
    return row


def _count_on_panel(db: Session, panel_id: str, asset_type: str, exclude_id: str | None) -> int:
    """Devices of this type already on the panel, excluding the one being saved."""
    if asset_type in {"ats", "generator"}:
        # Commissioned ATS/generator assets are mirrored into these tables with the
        # same ID, so the operational table is the complete list for the panel.
        model = ATS if asset_type == "ats" else Generator
        query = db.query(func.count(model.id)).filter(model.panel_id == panel_id)
        if exclude_id:
            query = query.filter(model.id != exclude_id)
    else:
        query = db.query(func.count(MonitoredAsset.id)).filter(
            MonitoredAsset.panel_id == panel_id, MonitoredAsset.asset_type == asset_type
        )
        if exclude_id:
            query = query.filter(MonitoredAsset.id != exclude_id)
    return query.scalar() or 0


def usage_max(db: Session) -> dict[str, int]:
    """The highest number of each device type currently on any single panel."""
    result: dict[str, int] = {}
    for asset_type, model in (("ats", ATS), ("generator", Generator)):
        counts = db.query(func.count(model.id)).group_by(model.panel_id).all()
        result[asset_type] = max((c for (c,) in counts), default=0)
    for asset_type in ("meter", "fuel_tank"):
        counts = (
            db.query(func.count(MonitoredAsset.id))
            .filter(MonitoredAsset.asset_type == asset_type, MonitoredAsset.panel_id.isnot(None))
            .group_by(MonitoredAsset.panel_id)
            .all()
        )
        result[asset_type] = max((c for (c,) in counts), default=0)
    return result


def enforce_panel_limit(
    db: Session,
    panel_id: str | None,
    asset_type: str,
    exclude_id: str | None = None,
    slot: str | None = None,
) -> None:
    """Reject placing one more device of ``asset_type`` on a panel that is full,
    or into a slot outside the configured range (e.g. A5 when the ATS limit is 4)."""
    if not panel_id or asset_type not in DEFAULT_LIMITS:
        return
    limit = get_limits(db)[asset_type]
    label = LABELS[asset_type]
    if slot:
        prefix = SLOT_PREFIX[asset_type]
        number = slot[len(prefix):] if slot.upper().startswith(prefix) else ""
        if not number.isdigit() or not 1 <= int(number) <= limit:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Slot {slot} is not available for a {label}. Each panel allows {prefix}1–{prefix}{limit} "
                "(change the limit under Settings → Panel Device Limits).",
            )
    if _count_on_panel(db, panel_id, asset_type, exclude_id) >= limit:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"This panel already has the maximum of {limit} {label}{'' if limit == 1 or label == 'ATS' else 's'}. "
            "Remove one or raise the limit under Settings → Panel Device Limits.",
        )
