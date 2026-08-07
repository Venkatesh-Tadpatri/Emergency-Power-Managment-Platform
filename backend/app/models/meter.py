from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class Meter(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "meters"

    ats_id: Mapped[str] = mapped_column(ForeignKey("ats_devices.id"), nullable=False, unique=True)
    # Placeholder identity fields; live meter readings arrive via the future telemetry pipeline.
    make: Mapped[str | None] = mapped_column(String(100))
    model: Mapped[str | None] = mapped_column(String(100))

    ats: Mapped["ATS"] = relationship(back_populates="meter")
