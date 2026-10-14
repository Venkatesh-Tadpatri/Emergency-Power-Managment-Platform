from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class MqttTopicMapping(Base, UUIDPKMixin, TimestampMixin):
    """MySQL registry that binds one PLC topic root to one system device."""

    __tablename__ = "mqtt_topic_mappings"
    __table_args__ = (
        UniqueConstraint("base_topic", name="uq_mqtt_topic_mappings_base_topic"),
        UniqueConstraint("device_type", "device_id", name="uq_mqtt_topic_mappings_device"),
    )

    system_id: Mapped[str] = mapped_column(ForeignKey("systems.id"), nullable=False, index=True)
    panel_id: Mapped[str] = mapped_column(ForeignKey("panels.id"), nullable=False, index=True)
    device_type: Mapped[str] = mapped_column(String(20), nullable=False)
    device_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    base_topic: Mapped[str] = mapped_column(String(512), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    system: Mapped["System"] = relationship()
    panel: Mapped["Panel"] = relationship()
