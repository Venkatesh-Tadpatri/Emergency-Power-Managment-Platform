from sqlalchemy import Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class ATS(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "ats_devices"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    manufacturer: Mapped[str | None] = mapped_column(String(100))
    model: Mapped[str | None] = mapped_column(String(100))
    serial_number: Mapped[str | None] = mapped_column(String(100))
    # life-safety | critical | equipment
    branch: Mapped[str] = mapped_column(String(20), default="equipment", nullable=False)
    # utility | generator
    source_type: Mapped[str] = mapped_column(String(20), default="utility", nullable=False)
    rated_amps: Mapped[float | None] = mapped_column(Float)
    rated_volts: Mapped[float | None] = mapped_column(Float)
    panel_id: Mapped[str] = mapped_column(ForeignKey("panels.id"), nullable=False)

    panel: Mapped["Panel"] = relationship(back_populates="ats_devices")
    meter: Mapped["Meter | None"] = relationship(back_populates="ats", uselist=False)
