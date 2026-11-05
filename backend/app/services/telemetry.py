"""MQTT-to-InfluxDB telemetry bridge for ATS and generator devices."""

from __future__ import annotations

import json
import logging
import queue
import re
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.config import settings
from app.database import SessionLocal
from app.models.ats import ATS
from app.models.generator import Generator
from app.models.monitored_asset import MonitoredAsset
from app.models.mqtt_topic_mapping import MqttTopicMapping
from app.services.mqtt_topics import normalize_topic

# Use Uvicorn's configured logger so bridge activity is visible in Docker logs.
logger = logging.getLogger("uvicorn.error")

METRIC_MAPPINGS: dict[tuple[str, str], tuple[str, ...]] = {
    ("M", "POWER"): (
        "voltage_l1_l2_v", "voltage_l2_l3_v", "voltage_l3_l1_v",
        "voltage_l1_n_v", "voltage_l2_n_v", "voltage_l3_n_v",
        "current_l1_a", "current_l2_a", "current_l3_a", "active_power_kw",
    ),
    ("G", "POWER"): (
        "voltage_l1_l2_v", "voltage_l2_l3_v", "voltage_l3_l1_v",
        "voltage_l1_n_v", "voltage_l2_n_v", "voltage_l3_n_v",
        "current_l1_a", "current_l2_a", "current_l3_a", "active_power_kw",
        "apparent_power_kva", "reactive_power_kvar", "frequency_hz", "power_factor",
    ),
    ("G", "STATUS"): (
        "status_word", "oil_pressure_psi", "coolant_temperature_c",
        "battery_voltage", "fuel_level_percent", "engine_hours",
    ),
    ("A", "STATUS"): (
        "status_word", "time_to_bus_seconds", "time_to_transfer_seconds",
    ),
    ("M", "STATUS"): (
        "plc_error", "plc_warning", "battery_low",
    ),
    ("F", "FUEL"): (
        "fuel_level_percent", "fuel_volume_gallons",
    ),
}

POWER_FIELD_NAMES = frozenset(
    name for (device_kind, message_kind), names in METRIC_MAPPINGS.items()
    if message_kind == "POWER" for name in names
)


def topic_matches_base(topic: str | None, bases: set[str]) -> bool:
    """Return whether a stored/published topic belongs to a current device mapping."""
    normalized = normalize_topic(topic)
    return bool(normalized and any(normalized == base or normalized.startswith(f"{base}/") for base in bases))


def map_payload(topic: str, payload: bytes | str) -> dict[str, float | int]:
    parts = topic.rstrip("/").split("/")
    if len(parts) < 2:
        return {}
    kind = parts[-1].upper()
    device_kind = parts[-2][:1].upper()
    names = METRIC_MAPPINGS.get((device_kind, kind))
    if not names:
        return {}
    raw = (payload.decode("utf-8") if isinstance(payload, bytes) else payload).strip()
    try:
        decoded = json.loads(raw)
    except json.JSONDecodeError:
        decoded = [part.strip() for part in re.split(r"[,;]", raw)]
    if isinstance(decoded, dict):
        metrics = decoded.get("metrics", decoded.get("values"))
    else:
        metrics = decoded
    if not isinstance(metrics, list):
        raise ValueError("payload must be a JSON metrics/values array or CSV value list")
    converted: list[float | int | None] = []
    for value in metrics:
        if isinstance(value, bool):
            converted.append(None)
        elif isinstance(value, (int, float)):
            converted.append(value)
        elif isinstance(value, str):
            try:
                number = float(value)
                converted.append(int(number) if number.is_integer() else number)
            except ValueError:
                converted.append(None)
        else:
            converted.append(None)
    return {
        name: value
        for name, value in zip(names, converted)
        if value is not None
    }


@dataclass(frozen=True)
class DeviceMatch:
    device_type: str
    device_id: str
    device_name: str
    base_topic: str
    system_id: str
    company_id: str
    site_id: str
    panel_id: str


def find_device(topic: str) -> DeviceMatch | None:
    with SessionLocal() as db:
        exact_matches: list[DeviceMatch] = []
        route_matches: list[DeviceMatch] = []
        topic_parts = topic.strip("/").split("/")
        # A PLC is uniquely registered by its MAC/serial plus terminal slot. This fallback handles
        # field devices that accidentally publish JSON in the customer/panel segments while refusing
        # to route anything when that pair is ambiguous in MySQL.
        published_route = (topic_parts[0].upper(), topic_parts[-2].upper()) if len(topic_parts) >= 3 else None
        fuel_tanks = db.query(MonitoredAsset).filter(MonitoredAsset.asset_type == "fuel_tank", MonitoredAsset.mqtt_topic.isnot(None)).all()
        fuel_matches = []
        for tank in fuel_tanks:
            base = normalize_topic(tank.mqtt_topic)
            if base and (topic == base or topic.startswith(f"{base}/") or base == topic.rsplit("/", 1)[0]):
                system = tank.system
                fuel_matches.append(DeviceMatch("fuel_tank", tank.id, tank.asset_tag, base, system.id, system.company_id, system.site_id, tank.panel_id or ""))
        if fuel_matches:
            return max(fuel_matches, key=lambda match: len(match.base_topic))
        mappings = db.query(MqttTopicMapping).filter(MqttTopicMapping.enabled.is_(True)).all()
        for mapping in mappings:
            base = normalize_topic(mapping.base_topic)
            if not base:
                continue
            is_exact = topic == base or topic.startswith(f"{base}/")
            base_parts = base.split("/")
            is_route = bool(published_route and len(base_parts) >= 2 and
                            (base_parts[0].upper(), base_parts[-1].upper()) == published_route)
            if not is_exact and not is_route:
                continue
            is_generator = mapping.device_type in {"generator", "generator_power"}
            item = db.get(Generator if is_generator else ATS, mapping.device_id)
            if not item or item.panel.system_id != mapping.system_id:
                logger.error("Rejected stale/cross-system MQTT mapping %s", mapping.id)
                continue
            system = item.panel.system
            match = DeviceMatch(
                "generator" if is_generator else "ats", item.id, item.name, base, system.id,
                system.company_id, system.site_id, item.panel_id,
            )
            (exact_matches if is_exact else route_matches).append(match)
        if exact_matches:
            return max(exact_matches, key=lambda match: len(match.base_topic))
        unique_routes = {(match.device_type, match.device_id): match for match in route_matches}
        if len(unique_routes) == 1:
            match = next(iter(unique_routes.values()))
            logger.warning("Accepted malformed MQTT path by unique PLC/slot route for %s", match.device_id)
            return match
        if route_matches:
            logger.error("Rejected ambiguous MQTT PLC/slot route: %s", topic)
        return None


class TelemetryBridge:
    def __init__(self) -> None:
        self._mqtt = None
        self._influx = None
        self._writer = None
        self._point_factory = None
        self._write_precision = None
        self.connected = False
        self.last_message_topic: str | None = None
        self.last_error: str | None = None
        self._latest: dict[tuple[str, str], tuple[DeviceMatch, str, dict[str, float | int]]] = {}
        self._latest_received_at: dict[tuple[str, str], datetime] = {}
        # Keep the latest decodable packet even when its topic has not been assigned yet. This lets
        # a configuration save activate a packet which arrived moments before the mapping existed.
        self._topic_cache: dict[str, tuple[dict[str, float | int], datetime]] = {}
        self._latest_lock = threading.Lock()
        self._write_queue: queue.Queue[tuple[DeviceMatch, str, dict[str, float | int]]] = queue.Queue()
        self._sampler_stop = threading.Event()
        self._sampler: threading.Thread | None = None

    def start(self) -> None:
        if not settings.mqtt_enabled:
            logger.info("MQTT telemetry bridge is disabled")
            return
        if not settings.influxdb_token:
            logger.warning("MQTT bridge not started: INFLUXDB_TOKEN is empty")
            return
        try:
            import paho.mqtt.client as mqtt
            from influxdb_client import InfluxDBClient, Point, WritePrecision
            from influxdb_client.client.write_api import SYNCHRONOUS
        except ImportError:
            logger.exception(
                "MQTT telemetry packages are unavailable; rebuild/install backend requirements"
            )
            return
        self._influx = InfluxDBClient(
            url=settings.influxdb_url, token=settings.influxdb_token, org=settings.influxdb_org
        )
        # Synchronous writes run only in the dedicated persistence worker. This lets failures be
        # retried deterministically instead of being reported later by an async callback.
        self._writer = self._influx.write_api(write_options=SYNCHRONOUS)
        self._point_factory = Point
        self._write_precision = WritePrecision.NS
        self._bootstrap_latest_samples()
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="cpc-telemetry-api")
        if settings.mqtt_username:
            client.username_pw_set(settings.mqtt_username, settings.mqtt_password)
        if settings.mqtt_tls:
            client.tls_set()
        client.on_connect = self._on_connect
        client.on_connect_fail = self._on_connect_fail
        client.on_disconnect = self._on_disconnect
        client.on_message = self._on_message
        client.reconnect_delay_set(min_delay=1, max_delay=30)
        client.connect_async(settings.mqtt_host, settings.mqtt_port, keepalive=60)
        client.loop_start()
        self._mqtt = client
        self._sampler_stop.clear()
        self._sampler = threading.Thread(target=self._sample_loop, name="telemetry-sampler", daemon=True)
        self._sampler.start()

    def stop(self) -> None:
        self._sampler_stop.set()
        if self._sampler and self._sampler.is_alive():
            self._sampler.join(timeout=2)
        if self._mqtt:
            self._mqtt.loop_stop()
            self._mqtt.disconnect()
        if self._influx:
            self._influx.close()
        self.connected = False

    def _on_connect(self, client, _userdata, _flags, reason_code, _properties) -> None:
        if reason_code == 0:
            client.subscribe(settings.mqtt_topic_filter, qos=0)
            self.connected = True
            self.last_error = None
            logger.info("Subscribed to MQTT topic filter %s", settings.mqtt_topic_filter)
        else:
            self.connected = False
            self.last_error = f"connection failed: {reason_code}"
            logger.error("MQTT connection failed with reason %s", reason_code)

    def _on_disconnect(self, _client, _userdata, _flags, reason_code, _properties) -> None:
        self.connected = False
        if reason_code != 0:
            self.last_error = f"disconnected: {reason_code}"
            logger.warning("MQTT disconnected with reason %s", reason_code)

    def _on_connect_fail(self, _client, _userdata) -> None:
        self.connected = False
        self.last_error = f"cannot reach MQTT broker {settings.mqtt_host}:{settings.mqtt_port}"
        logger.error("%s; the client will keep retrying", self.last_error)

    def _on_message(self, _client, _userdata, message) -> None:
        try:
            self.last_message_topic = message.topic
            fields = map_payload(message.topic, message.payload)
            if not fields:
                logger.warning("Ignored MQTT topic with no metric mapping: %s", message.topic)
                return
            received_at = datetime.now(timezone.utc)
            with self._latest_lock:
                self._topic_cache[normalize_topic(message.topic) or message.topic] = (fields, received_at)
            device = find_device(message.topic)
            if not device:
                logger.warning("Ignored MQTT topic with no matching device: %s", message.topic)
                return
            with self._latest_lock:
                key = (device.device_type, device.device_id)
                previous = self._latest.get(key)
                merged_fields = {**(previous[2] if previous else {}), **fields}
                # A status packet updates engine/state fields but must not relabel the merged
                # electrical snapshot as G1/STATUS. Keep the power topic as snapshot provenance.
                is_power_message = message.topic.rstrip("/").upper().endswith("/POWER")
                snapshot_topic = message.topic if is_power_message or not previous else previous[1]
                self._latest[key] = (device, snapshot_topic, merged_fields)
                self._latest_received_at[key] = received_at
                sample = (device, snapshot_topic, dict(merged_fields))
            self._write_queue.put(sample)
            logger.info(
                "Cached MQTT fields for %s (%s) from %s: %s",
                device.device_name, device.device_id, message.topic, fields,
            )
        except Exception as exc:
            self.last_error = str(exc)
            logger.exception("Unable to ingest MQTT message from %s", message.topic)

    def _sample_loop(self) -> None:
        """Persist every actual MQTT update once, retrying without blocking MQTT ingestion."""
        while not self._sampler_stop.is_set():
            try:
                sample = self._write_queue.get(timeout=1)
            except queue.Empty:
                continue
            device, topic, fields = sample
            while not self._sampler_stop.is_set():
                try:
                    self._write_sample(device, topic, fields)
                    self._write_queue.task_done()
                    break
                except Exception as exc:
                    self.last_error = f"InfluxDB write failed: {exc}"
                    logger.exception(
                        "Unable to store MQTT telemetry for %s; queued sample will retry in 5 seconds",
                        device.device_id,
                    )
                    self._sampler_stop.wait(5)

    def _bootstrap_latest_samples(self) -> None:
        """Resume fixed-interval history from the last stored values after a restart.

        InfluxDB points are immutable by timestamp. Reusing the latest field values with a new
        timestamp creates the requested five-second rows without overwriting prior history.
        """
        try:
            with SessionLocal() as db:
                allowed_topics: dict[tuple[str, str], set[str]] = {}
                mappings = db.query(MqttTopicMapping).filter(MqttTopicMapping.enabled.is_(True)).all()
                for mapping in mappings:
                    device_type = "generator" if mapping.device_type.startswith("generator") else "ats"
                    base = normalize_topic(mapping.base_topic)
                    if base:
                        allowed_topics.setdefault((device_type, mapping.device_id), set()).add(base)
                for tank in db.query(MonitoredAsset).filter(MonitoredAsset.asset_type == "fuel_tank", MonitoredAsset.mqtt_topic.isnot(None)).all():
                    base = normalize_topic(tank.mqtt_topic)
                    if base:
                        allowed_topics.setdefault(("fuel_tank", tank.id), set()).add(base)
            flux = f'''from(bucket: {json.dumps(settings.influxdb_bucket)})
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "device_telemetry")
  |> last()'''
            accumulated: dict[tuple[str, str], tuple[DeviceMatch, str, dict[str, float | int]]] = {}
            for table in self._influx.query_api().query(flux, org=settings.influxdb_org):
                for record in table.records:
                    values = record.values
                    device_id = values.get("device_id")
                    device_type = values.get("device_type")
                    field_value = record.get_value()
                    if not device_id or not device_type or not isinstance(field_value, (int, float)):
                        continue
                    key = (device_type, device_id)
                    if not topic_matches_base(values.get("mqtt_topic"), allowed_topics.get(key, set())):
                        continue
                    if key not in accumulated:
                        accumulated[key] = (
                            DeviceMatch(
                                device_type=device_type,
                                device_id=device_id,
                                device_name=values.get("device_name") or device_id,
                                base_topic=values.get("mqtt_topic") or "",
                                system_id=values.get("system_id") or "",
                                company_id=values.get("company_id") or "",
                                site_id=values.get("site_id") or "",
                                panel_id=values.get("panel_id") or "",
                            ),
                            values.get("mqtt_topic") or "",
                            {},
                        )
                    accumulated[key][2][record.get_field()] = field_value
            with self._latest_lock:
                self._latest.update(accumulated)
                for key, (_, _, fields) in accumulated.items():
                    # Bootstrapped values are a fallback until a fresh MQTT message replaces them.
                    self._latest_received_at.setdefault(key, datetime.now(timezone.utc))
            if accumulated:
                logger.info("Restored latest telemetry cache for %d devices from InfluxDB", len(accumulated))
        except Exception:
            logger.exception("Unable to resume latest telemetry samples from InfluxDB")

    def _write_sample(self, device: DeviceMatch, topic: str, fields: dict[str, float | int]) -> None:
        point = (
                self._point_factory("device_telemetry")
                .tag("company_id", device.company_id)
                .tag("site_id", device.site_id)
                .tag("system_id", device.system_id)
                .tag("panel_id", device.panel_id)
                .tag("device_type", device.device_type)
                .tag("device_id", device.device_id)
                .tag("device_name", device.device_name)
                .tag("mqtt_topic", topic)
                .time(datetime.now(timezone.utc), self._write_precision)
            )
        for name, value in fields.items():
            point.field(name, value)
        self._writer.write(bucket=settings.influxdb_bucket, org=settings.influxdb_org, record=point)
        logger.info(
            "Stored MQTT snapshot with %d fields for %s (%s); queue_depth=%d",
            len(fields), device.device_name, device.device_id,
            self._write_queue.qsize(),
        )

    def latest_fields(self, device_ids: set[str]) -> dict[str, dict[str, Any]]:
        """Return an in-process snapshot without blocking the live API on an Influx query."""
        with self._latest_lock:
            return {
                device_id: {
                    "timestamp": self._latest_received_at.get((device_type, device_id), datetime.now(timezone.utc)).isoformat(),
                    **fields,
                }
                for (device_type, device_id), (_, _, fields) in self._latest.items()
                if device_id in device_ids
            }

    def invalidate_fields(self, device_type: str, device_id: str, fields: set[str] | frozenset[str]) -> None:
        """Stop sampling values that came from a mapping which has just changed."""
        key = (device_type, device_id)
        with self._latest_lock:
            cached = self._latest.get(key)
            if not cached:
                return
            device, topic, values = cached
            remaining = {name: value for name, value in values.items() if name not in fields}
            if remaining:
                self._latest[key] = (device, topic, remaining)
            else:
                self._latest.pop(key, None)
                self._latest_received_at.pop(key, None)

    def activate_cached_power_topic(self, device_type: str, device_id: str, base_topic: str | None) -> bool:
        """Replace stale power fields and apply the last packet already seen for a new mapping."""
        base = normalize_topic(base_topic)
        full_topic = f"{base}/POWER" if base else None
        with self._latest_lock:
            cached_packet = self._topic_cache.get(full_topic) if full_topic else None
        device = find_device(full_topic) if full_topic and cached_packet else None
        key = (device_type, device_id)
        with self._latest_lock:
            existing = self._latest.get(key)
            remaining = {
                name: value for name, value in (existing[2] if existing else {}).items()
                if name not in POWER_FIELD_NAMES
            }
            if not device or device.device_type != device_type or device.device_id != device_id or not cached_packet:
                if existing and remaining:
                    self._latest[key] = (existing[0], existing[1], remaining)
                elif existing:
                    self._latest.pop(key, None)
                    self._latest_received_at.pop(key, None)
                return False
            fields, received_at = cached_packet
            merged = {**remaining, **fields}
            self._latest[key] = (device, full_topic, merged)
            self._latest_received_at[key] = received_at
            sample = (device, full_topic, dict(merged))
        self._write_queue.put(sample)
        logger.info("Activated cached MQTT packet %s for %s", full_topic, device_id)
        return True


telemetry_bridge = TelemetryBridge()


def latest_system_snapshot(system, generators, ats_devices, fuel_tanks=None) -> dict[str, Any]:
    """Return the most recent Influx fields for one system's registered devices."""
    fuel_tanks = fuel_tanks or []
    device_ids = [item.id for item in generators if item.mqtt_topic or item.power_mqtt_topic] + [
        item.id for item in ats_devices if item.mqtt_topic or item.power_mqtt_topic
    ] + [item.id for item in fuel_tanks if item.mqtt_topic]
    result = telemetry_bridge.latest_fields(set(device_ids))
    allowed_topics = {
        item.id: {
            topic for topic in (normalize_topic(item.mqtt_topic), normalize_topic(item.power_mqtt_topic)) if topic
        }
        for item in [*generators, *ats_devices, *fuel_tanks]
    }
    missing_device_ids = [device_id for device_id in device_ids if device_id not in result]
    if missing_device_ids and settings.influxdb_token:
        try:
            from influxdb_client import InfluxDBClient

            ids = ", ".join(json.dumps(device_id) for device_id in missing_device_ids)
            flux = f'''from(bucket: {json.dumps(settings.influxdb_bucket)})
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "device_telemetry")
  |> filter(fn: (r) => r.system_id == {json.dumps(system.id)})
  |> filter(fn: (r) => contains(value: r.device_id, set: [{ids}]))
  |> last()'''
            with InfluxDBClient(
                url=settings.influxdb_url, token=settings.influxdb_token, org=settings.influxdb_org
            ) as client:
                for table in client.query_api().query(flux, org=settings.influxdb_org):
                    for record in table.records:
                        device_id = record.values.get("device_id")
                        if device_id and topic_matches_base(record.values.get("mqtt_topic"), allowed_topics.get(device_id, set())):
                            target = result.setdefault(device_id, {"timestamp": record.get_time().isoformat()})
                            target[record.get_field()] = record.get_value()
        except Exception:
            logger.exception("Unable to read latest telemetry for system %s", system.id)

    def electrical(item, device_type: str) -> dict[str, Any]:
        fields = result.get(item.id, {})
        status_code = fields.get("status_word")
        status_word = int(status_code or 0)
        data: dict[str, Any] = {
            "equipment_id": item.id,
            "equipment_name": item.name,
            "mqtt_topic": item.mqtt_topic,
            "telemetry_source": "influxdb",
            "timestamp": fields.get("timestamp"),
            "communication_healthy": bool(fields),
            "status": f"STATE {status_word}" if status_code is not None else "WAITING",
            "voltage_ab": fields.get("voltage_l1_l2_v"),
            "voltage_bc": fields.get("voltage_l2_l3_v"),
            "voltage_ca": fields.get("voltage_l3_l1_v"),
            "voltage_an": fields.get("voltage_l1_n_v"),
            "voltage_bn": fields.get("voltage_l2_n_v"),
            "voltage_cn": fields.get("voltage_l3_n_v"),
            "current_a": fields.get("current_l1_a"),
            "current_b": fields.get("current_l2_a"),
            "current_c": fields.get("current_l3_a"),
            "power_factor": fields.get("power_factor"),
        }
        if device_type == "generator":
            running = bool(status_word & 1)
            alarm = bool(status_word & (1 << 1))
            active_kw = fields.get("active_power_kw")
            load_percent = (float(active_kw) / item.rated_kw * 100) if item.rated_kw and active_kw is not None else None
            data.update({
                "status": "FAULT" if alarm else "RUNNING" if running else "READY" if fields else "WAITING",
                "running": running,
                "auto_mode": not bool(status_word & (1 << 2)),
                "fault_active": alarm,
                "frequency": fields.get("frequency_hz"),
                "active_power_kw": active_kw,
                "apparent_power_kva": fields.get("apparent_power_kva"),
                "load_percentage": round(load_percent, 2) if load_percent is not None else None,
                "fuel_level_percent": fields.get("fuel_level_percent"),
                "engine_hours": fields.get("engine_hours"),
                "oil_pressure_psi": fields.get("oil_pressure_psi"),
                "coolant_temperature_c": fields.get("coolant_temperature_c"),
                "battery_voltage": fields.get("battery_voltage"),
            })
        else:
            utility = bool(status_word & 1)
            utility_connected = bool(status_word & (1 << 1))
            generator = bool(status_word & (1 << 2))
            generator_connected = bool(status_word & (1 << 3))
            data.update({
                "status": "EMERGENCY" if generator_connected else "NORMAL" if utility_connected else "WAITING",
                "utility_available": utility,
                "generator_available": generator,
                "connected_source": "GENERATOR" if generator_connected else "UTILITY" if utility_connected else "OFF",
                "transfer_time_seconds": fields.get("time_to_transfer_seconds"),
                "time_on_emergency_seconds": fields.get("time_to_bus_seconds"),
                "fault_active": False,
            })
        return {key: value for key, value in data.items() if value is not None}

    return {
        "customer": {"id": system.company_id, "name": system.company.name},
        "site": {"id": system.site_id, "name": system.site.name},
        "system": {"id": system.id, "name": system.name},
        # MQTT messages are ingested immediately; clients query the latest
        # system-scoped InfluxDB values on this five-second display cadence.
        "refresh_interval_ms": 5000,
        "storage": {
            "engine": "InfluxDB 2.x",
            "url": settings.influxdb_url,
            "org": settings.influxdb_org,
            "bucket": settings.influxdb_bucket,
            "measurement": "device_telemetry",
            "has_data": bool(result),
            "mqtt_connected": telemetry_bridge.connected,
            "last_mqtt_topic": telemetry_bridge.last_message_topic,
            "mqtt_error": telemetry_bridge.last_error,
        },
        "generators": [electrical(item, "generator") for item in generators if item.mqtt_topic or item.power_mqtt_topic],
        "ats": [electrical(item, "ats") for item in ats_devices if item.mqtt_topic or item.power_mqtt_topic],
        "fuel_tanks": [{
            "equipment_id": item.id,
            "equipment_name": item.asset_tag,
            "mqtt_topic": item.mqtt_topic,
            "timestamp": result.get(item.id, {}).get("timestamp"),
            "communication_healthy": bool(result.get(item.id)),
            "level_percent": result.get(item.id, {}).get("fuel_level_percent"),
            "volume_gallons": result.get(item.id, {}).get("fuel_volume_gallons"),
        } for item in fuel_tanks if item.mqtt_topic],
    }
