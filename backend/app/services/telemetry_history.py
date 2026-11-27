"""Historical telemetry for the in-app React analytics.

Reads the ``device_telemetry`` measurement that the MQTT bridge writes to InfluxDB and returns it
down-sampled into fixed time buckets, keyed by the same field names the live snapshot API uses so
the frontend can chart history and live values with one vocabulary.
"""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from typing import Any

from app.config import settings

logger = logging.getLogger("uvicorn.error")

# range key -> (Flux range start, aggregation window, window seconds). Every range resolves to
# roughly 60-170 buckets: enough resolution for a trend line, small enough to render instantly.
RANGES: dict[str, tuple[str, str, int]] = {
    "1h": ("-1h", "1m", 60),
    "6h": ("-6h", "5m", 300),
    "24h": ("-24h", "15m", 900),
    "7d": ("-7d", "1h", 3600),
    "30d": ("-30d", "6h", 21600),
}

# InfluxDB field name -> API field name (matches latest_system_snapshot's vocabulary).
NUMERIC_FIELDS: dict[str, str] = {
    "voltage_l1_l2_v": "voltage_ab",
    "voltage_l2_l3_v": "voltage_bc",
    "voltage_l3_l1_v": "voltage_ca",
    "voltage_l1_n_v": "voltage_an",
    "voltage_l2_n_v": "voltage_bn",
    "voltage_l3_n_v": "voltage_cn",
    "current_l1_a": "current_a",
    "current_l2_a": "current_b",
    "current_l3_a": "current_c",
    "active_power_kw": "active_power_kw",
    "apparent_power_kva": "apparent_power_kva",
    "reactive_power_kvar": "reactive_power_kvar",
    "frequency_hz": "frequency",
    "power_factor": "power_factor",
    "fuel_level_percent": "fuel_level_percent",
    "coolant_temperature_c": "coolant_temperature_c",
    "oil_pressure_psi": "oil_pressure_psi",
    "battery_voltage": "battery_voltage",
    "engine_hours": "engine_hours",
    "time_to_transfer_seconds": "transfer_time_seconds",
}


class HistoryUnavailable(RuntimeError):
    """InfluxDB is not configured or could not be queried."""


def _flux_any(column: str, values: list[str]) -> str:
    # Plain equality ORs (not contains()) so InfluxDB can push the filter + window aggregate down
    # into storage; contains() forces a full in-memory scan and times out on 30-day ranges.
    return " or ".join(f"r.{column} == {json.dumps(value)}" for value in values)


def _query(flux: str) -> list[Any]:
    from influxdb_client import InfluxDBClient

    with InfluxDBClient(url=settings.influxdb_url, token=settings.influxdb_token, org=settings.influxdb_org, timeout=30_000) as client:
        return client.query_api().query(flux, org=settings.influxdb_org)


def device_history(devices: list[dict[str, Any]], range_key: str) -> dict[str, Any]:
    """Return bucketed history for ``devices``.

    Each device dict carries ``id``, ``type`` ("generator" | "ats"), ``name``, ``system_id`` and
    ``rated_kw`` (generators only, used to derive load %).
    """
    if range_key not in RANGES:
        raise ValueError(f"range must be one of {', '.join(RANGES)}")
    start, window, window_seconds = RANGES[range_key]
    result: dict[str, Any] = {"range": range_key, "window_seconds": window_seconds, "devices": []}
    if not devices:
        return result
    if not settings.influxdb_token:
        raise HistoryUnavailable("InfluxDB is not configured")

    device_ids = [device["id"] for device in devices]
    system_ids = sorted({device["system_id"] for device in devices})
    base = f'''from(bucket: {json.dumps(settings.influxdb_bucket)})
  |> range(start: {start})
  |> filter(fn: (r) => r._measurement == "device_telemetry")
  |> filter(fn: (r) => {_flux_any("system_id", system_ids)})
  |> filter(fn: (r) => {_flux_any("device_id", device_ids)})'''
    # Aggregate per stored series first (pushed down to storage), then regroup by device+field so
    # samples written under different MQTT topics (POWER vs STATUS provenance) merge into one series.
    numeric_flux = f'''{base}
  |> filter(fn: (r) => {_flux_any("_field", list(NUMERIC_FIELDS))})
  |> aggregateWindow(every: {window}, fn: mean, createEmpty: false)
  |> group(columns: ["device_id", "_field", "_time"])
  |> mean()
  |> group(columns: ["device_id", "_field"])'''
    # status_word is a bit field: averaging it is meaningless, so take the last word per bucket.
    status_flux = f'''{base}
  |> filter(fn: (r) => r._field == "status_word")
  |> aggregateWindow(every: {window}, fn: last, createEmpty: false)
  |> group(columns: ["device_id", "_field"])'''

    buckets: dict[str, dict[int, dict[str, float]]] = defaultdict(lambda: defaultdict(dict))
    try:
        for table in _query(numeric_flux):
            for record in table.records:
                value = record.get_value()
                name = NUMERIC_FIELDS.get(record.get_field())
                if name is None or not isinstance(value, (int, float)):
                    continue
                t = int(record.get_time().timestamp() * 1000)
                buckets[record.values["device_id"]][t][name] = round(float(value), 3)
        for table in _query(status_flux):
            for record in table.records:
                value = record.get_value()
                if not isinstance(value, (int, float)):
                    continue
                t = int(record.get_time().timestamp() * 1000)
                buckets[record.values["device_id"]][t]["status_word"] = int(value)
    except Exception as exc:  # noqa: BLE001 - surfaced to the client as a 503
        logger.exception("Unable to read telemetry history")
        raise HistoryUnavailable("Telemetry history is temporarily unavailable") from exc

    for device in devices:
        points = []
        for t, fields in sorted(buckets.get(device["id"], {}).items()):
            point: dict[str, Any] = {"t": t, **{k: v for k, v in fields.items() if k != "status_word"}}
            word = fields.get("status_word")
            if device["type"] == "generator":
                kw = fields.get("active_power_kw")
                if device.get("rated_kw") and kw is not None:
                    point["load_percentage"] = round(kw / device["rated_kw"] * 100, 2)
                if word is not None:
                    point["running"] = 1 if word & 1 else 0
                    point["fault"] = 1 if word & (1 << 1) else 0
            elif word is not None:
                point["on_emergency"] = 1 if word & (1 << 3) else 0
                point["utility_available"] = 1 if word & 1 else 0
            points.append(point)
        result["devices"].append({
            "equipment_id": device["id"],
            "equipment_type": device["type"],
            "equipment_name": device["name"],
            "system_id": device["system_id"],
            "rated_kw": device.get("rated_kw"),
            "points": points,
        })
    return result
