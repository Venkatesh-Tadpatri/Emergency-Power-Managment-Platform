from sqlalchemy.orm import Session

from app.models.mqtt_topic_mapping import MqttTopicMapping


def normalize_topic(topic: str | None) -> str | None:
    value = (topic or "").strip().strip("/")
    return value or None


def _sync_one(db: Session, device, mapping_type: str, raw_topic: str | None) -> None:
    """Keep the normalized, system-scoped topic registry in sync with a device form."""
    topic = normalize_topic(raw_topic)
    mapping = db.query(MqttTopicMapping).filter(
        MqttTopicMapping.device_type == mapping_type,
        MqttTopicMapping.device_id == device.id,
    ).one_or_none()
    if not topic:
        if mapping:
            db.delete(mapping)
        return
    owner = db.query(MqttTopicMapping).filter(MqttTopicMapping.base_topic == topic).first()
    if owner and (not mapping or owner.id != mapping.id):
        raise ValueError("MQTT topic is already mapped to another device")
    if not mapping:
        mapping = MqttTopicMapping(device_type=mapping_type, device_id=device.id)
        db.add(mapping)
    mapping.system_id = device.panel.system_id
    mapping.panel_id = device.panel_id
    mapping.base_topic = topic
    mapping.enabled = True


def sync_device_topic(db: Session, device, device_type: str) -> None:
    device.mqtt_topic = normalize_topic(device.mqtt_topic)
    _sync_one(db, device, device_type, device.mqtt_topic)
    if device_type == "ats":
        device.power_mqtt_topic = normalize_topic(device.power_mqtt_topic)
        _sync_one(db, device, "ats_power", device.power_mqtt_topic)


def delete_device_topic(db: Session, device_id: str, device_type: str) -> None:
    mapping_types = [device_type, "ats_power"] if device_type == "ats" else [device_type]
    db.query(MqttTopicMapping).filter(
        MqttTopicMapping.device_type.in_(mapping_types),
        MqttTopicMapping.device_id == device_id,
    ).delete(synchronize_session=False)
