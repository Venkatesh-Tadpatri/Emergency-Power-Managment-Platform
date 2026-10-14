"""MQTT-to-InfluxDB telemetry bridge for ATS and generator devices."""

from __future__ import annotations

import json
import logging
import re
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.config import settings
from app.database import SessionLocal
from app.models.ats import ATS
from app.models.generator import Generator
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
}


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
            item = db.get(Generator if mapping.device_type == "generator" else ATS, mapping.device_id)
            if not item or item.panel.system_id != mapping.system_id:
                logger.error("Rejected stale/cross-system MQTT mapping %s", mapping.id)
                continue
            system = item.panel.system
            match = DeviceMatch(
                "generator" if mapping.device_type == "generator" else "ats", item.id, item.name, base, system.id,
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
        self._latest_lock = threading.Lock()
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
        except ImportError:
            logger.exception(
                "MQTT telemetry packages are unavailable; rebuild/install backend requirements"
            )
            return
        self._influx = InfluxDBClient(
            url=settings.influxdb_url, token=settings.influxdb_token, org=settings.influxdb_org
        )
        self._writer = self._influx.write_api()
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
            device = find_device(message.topic)
            if not fields:
                logger.warning("Ignored MQTT topic with no metric mapping: %s", message.topic)
                return
            if not device:
                logger.warning("Ignored MQTT topic with no matching device: %s", message.topic)
                return
            with self._latest_lock:
                key = (device.device_type, device.device_id)
                previous = self._latest.get(key)
                merged_fields = {**(previous[2] if previous else {}), **fields}
                self._latest[key] = (device, message.topic, merged_fields)
            logger.info(
                "Cached %d MQTT fields for %s (%s) from %s",
                len(fields), device.device_name, device.device_id, message.topic,
            )
        except Exception as exc:
            self.last_error = str(exc)
            logger.exception("Unable to ingest MQTT message from %s", message.topic)

    def _sample_loop(self) -> None:
        interval = max(1, settings.telemetry_sample_interval_seconds)
        while not self._sampler_stop.wait(interval):
            with self._latest_lock:
                samples = list(self._latest.values())
            for device, topic, fields in samples:
                try:
                    self._write_sample(device, topic, fields)
                except Exception as exc:
                    self.last_error = str(exc)
                    logger.exception("Unable to store sampled telemetry for %s", device.device_id)

    def _bootstrap_latest_samples(self) -> None:
        """Resume fixed-interval history from the last stored values after a restart.

        InfluxDB points are immutable by timestamp. Reusing the latest field values with a new
        timestamp creates the requested five-second rows without overwriting prior history.
        """
        try:
            flux = f'''from(bucket: {json.dumps(settings.influxdb_bucket)})
  |> range(start: -30d)
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
            if accumulated:
                logger.info("Resumed 5-second sampling for %d devices from InfluxDB", len(accumulated))
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
            "Stored 5-second snapshot with %d fields for %s (%s)",
            len(fields), device.device_name, device.device_id,
        )


telemetry_bridge = TelemetryBridge()


def latest_system_snapshot(system, generators, ats_devices) -> dict[str, Any]:
    """Return the most recent Influx fields for one system's registered devices."""
    device_ids = [item.id for item in generators if item.mqtt_topic] + [
        item.id for item in ats_devices if item.mqtt_topic or item.power_mqtt_topic
    ]
    result: dict[str, dict[str, Any]] = {}
    if device_ids and settings.influxdb_token:
        try:
            from influxdb_client import InfluxDBClient

            ids = ", ".join(json.dumps(device_id) for device_id in device_ids)
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
                        if device_id:
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
            active_kw = fields.get("active_power_kw", 0)
            load_percent = (float(active_kw) / item.rated_kw * 100) if item.rated_kw and active_kw is not None else 0
            data.update({
                "status": "FAULT" if alarm else "RUNNING" if running else "READY" if fields else "WAITING",
                "running": running,
                "auto_mode": not bool(status_word & (1 << 2)),
                "fault_active": alarm,
                "frequency": fields.get("frequency_hz", 0),
                "active_power_kw": active_kw,
                "apparent_power_kva": fields.get("apparent_power_kva", 0),
                "load_percentage": round(load_percent, 2),
                "fuel_level_percent": fields.get("fuel_level_percent", 0),
                "engine_hours": fields.get("engine_hours", 0),
                "oil_pressure_psi": fields.get("oil_pressure_psi", 0),
                "coolant_temperature_c": fields.get("coolant_temperature_c", 0),
                "battery_voltage": fields.get("battery_voltage", 0),
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
                "transfer_time_seconds": fields.get("time_to_transfer_seconds", 0),
                "time_on_emergency_seconds": fields.get("time_to_bus_seconds", 0),
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
        "generators": [electrical(item, "generator") for item in generators if item.mqtt_topic],
        "ats": [electrical(item, "ats") for item in ats_devices if item.mqtt_topic or item.power_mqtt_topic],
    }
