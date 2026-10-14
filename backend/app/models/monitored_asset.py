from datetime import date, datetime

from sqlalchemy import JSON, Date, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class MonitoredAsset(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "monitored_assets"

    system_id: Mapped[str] = mapped_column(ForeignKey("systems.id"), nullable=False, index=True)
    panel_id: Mapped[str | None] = mapped_column(ForeignKey("panels.id"), index=True)
    asset_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    asset_tag: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))
    manufacturer: Mapped[str | None] = mapped_column(String(100))
    model: Mapped[str | None] = mapped_column(String(100))
    serial_number: Mapped[str | None] = mapped_column(String(100))
    install_date: Mapped[date | None] = mapped_column(Date)
    location: Mapped[str | None] = mapped_column(String(255))
    slot: Mapped[str | None] = mapped_column(String(10))
    connection_mode: Mapped[str] = mapped_column(String(20), default="plc", nullable=False)
    mqtt_topic: Mapped[str | None] = mapped_column(String(512))
    command_topic: Mapped[str | None] = mapped_column(String(512))
    power_topic: Mapped[str | None] = mapped_column(String(512))
    controller: Mapped[str | None] = mapped_column(String(100))
    meter_model: Mapped[str | None] = mapped_column(String(100))
    measured_asset_id: Mapped[str | None] = mapped_column(String(36))
    branch: Mapped[str | None] = mapped_column(String(30))
    rating_amps: Mapped[float | None] = mapped_column(Float)
    rating_kw: Mapped[float | None] = mapped_column(Float)
    rating_kva: Mapped[float | None] = mapped_column(Float)
    voltage: Mapped[float | None] = mapped_column(Float)
    fuel_type: Mapped[str | None] = mapped_column(String(30))
    engine: Mapped[str | None] = mapped_column(String(100))
    measures: Mapped[str | None] = mapped_column(String(255))
    ct_ratio: Mapped[str | None] = mapped_column(String(30))
    pt_ratio: Mapped[str | None] = mapped_column(String(30))
    voltage_label: Mapped[str | None] = mapped_column(String(30))
    trip_amps: Mapped[float | None] = mapped_column(Float)
    interrupting_ka: Mapped[float | None] = mapped_column(Float)
    trip_unit: Mapped[str | None] = mapped_column(String(100))
    fed_from: Mapped[str | None] = mapped_column(String(100))
    feeds: Mapped[str | None] = mapped_column(String(100))
    input_voltage: Mapped[str | None] = mapped_column(String(30))
    output_voltage: Mapped[str | None] = mapped_column(String(30))
    topology: Mapped[str | None] = mapped_column(String(50))
    battery: Mapped[str | None] = mapped_column(String(100))
    runtime_minutes: Mapped[float | None] = mapped_column(Float)
    tank_read_mode: Mapped[str | None] = mapped_column(String(30))
    tank_gauge_model: Mapped[str | None] = mapped_column(String(100))
    served_generator_ids: Mapped[list | None] = mapped_column(JSON)
    capacity_gal: Mapped[float | None] = mapped_column(Float)
    tank_type: Mapped[str | None] = mapped_column(String(50))
    construction: Mapped[str | None] = mapped_column(String(100))
    low_level_percent: Mapped[float | None] = mapped_column(Float)
    runtime_hours: Mapped[float | None] = mapped_column(Float)
    poles: Mapped[str | None] = mapped_column(String(20))
    transition_type: Mapped[str | None] = mapped_column(String(30))
    linked_asset_id: Mapped[str | None] = mapped_column(String(36))
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)

    system: Mapped["System"] = relationship()
    panel: Mapped["Panel | None"] = relationship(back_populates="monitored_assets")


class PanelPush(Base, UUIDPKMixin):
    __tablename__ = "panel_pushes"

    panel_id: Mapped[str] = mapped_column(ForeignKey("panels.id"), nullable=False, index=True)
    pushed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    pushed_by: Mapped[str | None] = mapped_column(String(255))
    summary: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="confirmed", nullable=False)

    panel: Mapped["Panel"] = relationship(back_populates="pushes")
