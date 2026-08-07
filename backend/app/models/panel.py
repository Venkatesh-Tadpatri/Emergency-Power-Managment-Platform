from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class Panel(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "panels"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # MQTT topic path segment for this panel — unused until the ingestion pipeline lands.
    panel_mqtt_id: Mapped[str | None] = mapped_column(String(100))
    system_id: Mapped[str] = mapped_column(ForeignKey("systems.id"), nullable=False)
    connection_status: Mapped[str] = mapped_column(String(20), default="unknown", nullable=False)

    system: Mapped["System"] = relationship(back_populates="panels")
    ats_devices: Mapped[list["ATS"]] = relationship(
        back_populates="panel", cascade="all, delete-orphan"
    )
    generators: Mapped[list["Generator"]] = relationship(
        back_populates="panel", cascade="all, delete-orphan"
    )
