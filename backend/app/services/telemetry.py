"""MQTT-to-InfluxDB telemetry bridge for ATS and generator devices."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.config import settings
from app.database import SessionLocal
from app.models.ats import ATS
from app.models.generator import Generator

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


def normalize_topic(topic: str | None) -> str | None:
    value = (topic or "").strip().strip("/")
    return value or None


def map_payload(topic: str, payload: bytes | str) -> dict[str, float | int]:
    parts = topic.rstrip("/").split("/")
    if len(parts) < 2:
        return {}
    kind = parts[-1].upper()
    device_kind = parts[-2][:1].upper()
    names = METRIC_MAPPINGS.get((device_kind, kind))
    if not names:
        return {}
    raw = payload.decode("utf-8") if isinstance(payload, bytes) else payload
    metrics = json.loads(raw).get("metrics")
    if not isinstance(metrics, list):
        raise ValueError("payload must contain a metrics array")
    return {
        name: value
        for name, value in zip(names, metrics)
        if isinstance(value, (int, float)) and not isinstance(value, bool)
    }


@dataclass(frozen=True)
class DeviceMatch:
    device_type: str
    device_id: str
    device_name: str
    base_topic: str


def find_device(topic: str) -> DeviceMatch | None:
    with SessionLocal() as db:
        candidates: list[tuple[str, Any]] = [
            *(("ats", item) for item in db.query(ATS).filter(ATS.mqtt_topic.isnot(None)).all()),
            *(("generator", item) for item in db.query(Generator).filter(Generator.mqtt_topic.isnot(None)).all()),
        ]
        matches: list[DeviceMatch] = []
        for device_type, item in candidates:
            base = normalize_topic(item.mqtt_topic)
            if base and (topic == base or topic.startswith(f"{base}/")):
                matches.append(DeviceMatch(device_type, item.id, item.name, base))
        return max(matches, key=lambda match: len(match.base_topic), default=None)


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
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="cpc-telemetry-api")
        if settings.mqtt_username:
            client.username_pw_set(settings.mqtt_username, settings.mqtt_password)
        if settings.mqtt_tls:
            client.tls_set()
        client.on_connect = self._on_connect
        client.on_disconnect = self._on_disconnect
        client.on_message = self._on_message
        client.connect_async(settings.mqtt_host, settings.mqtt_port, keepalive=60)
        client.loop_start()
        self._mqtt = client

    def stop(self) -> None:
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
            point = (
                self._point_factory("device_telemetry")
                .tag("device_type", device.device_type)
                .tag("device_id", device.device_id)
                .tag("device_name", device.device_name)
                .tag("mqtt_topic", message.topic)
                .time(datetime.now(timezone.utc), self._write_precision)
            )
            for name, value in fields.items():
                point.field(name, value)
            self._writer.write(bucket=settings.influxdb_bucket, org=settings.influxdb_org, record=point)
            logger.info(
                "Stored %d MQTT fields for %s (%s) from %s",
                len(fields), device.device_name, device.device_id, message.topic,
            )
        except Exception as exc:
            self.last_error = str(exc)
            logger.exception("Unable to ingest MQTT message from %s", message.topic)


telemetry_bridge = TelemetryBridge()


def latest_system_snapshot(system, generators, ats_devices) -> dict[str, Any]:
    """Return the most recent Influx fields for one system's registered devices."""
    device_ids = [item.id for item in [*generators, *ats_devices] if item.mqtt_topic]
    result: dict[str, dict[str, Any]] = {}
    if device_ids and settings.influxdb_token:
        try:
            from influxdb_client import InfluxDBClient

            ids = ", ".join(json.dumps(device_id) for device_id in device_ids)
            flux = f'''from(bucket: {json.dumps(settings.influxdb_bucket)})
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "device_telemetry")
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
        data: dict[str, Any] = {
            "equipment_id": item.id,
            "equipment_name": item.name,
            "mqtt_topic": item.mqtt_topic,
            "telemetry_source": "influxdb",
            "timestamp": fields.get("timestamp"),
            "communication_healthy": bool(fields),
            "status": f"STATE {int(status_code)}" if status_code is not None else "WAITING",
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
            data.update({
                "running": status_code not in (None, 0),
                "fault_active": bool(int(status_code or 0) & (1 << 1)),
                "frequency": fields.get("frequency_hz", 0),
                "active_power_kw": fields.get("active_power_kw", 0),
                "apparent_power_kva": fields.get("apparent_power_kva", 0),
                "load_percentage": fields.get("load_percentage", 0),
                "fuel_level_percent": fields.get("fuel_level_percent", 0),
                "engine_hours": fields.get("engine_hours", 0),
                "oil_pressure_psi": fields.get("oil_pressure_psi", 0),
                "coolant_temperature_c": fields.get("coolant_temperature_c", 0),
                "battery_voltage": fields.get("battery_voltage", 0),
            })
        else:
            utility = bool(fields.get("utility_available"))
            generator = bool(fields.get("generator_available"))
            data.update({
                "utility_available": utility,
                "generator_available": generator,
                "connected_source": "GENERATOR" if generator and not utility else "UTILITY" if utility else "OFF",
                "fault_active": False,
            })
        return {key: value for key, value in data.items() if value is not None}

    return {
        "customer": {"id": system.company_id, "name": system.company.name},
        "site": {"id": system.site_id, "name": system.site.name},
        "system": {"id": system.id, "name": system.name},
        "refresh_interval_ms": 3000,
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
        "ats": [electrical(item, "ats") for item in ats_devices if item.mqtt_topic],
    }
