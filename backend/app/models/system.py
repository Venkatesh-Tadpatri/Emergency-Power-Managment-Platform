from sqlalchemy import Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class System(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "systems"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str | None] = mapped_column(String(500))
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), nullable=False)
    # Display-only status snapshot (normal/emergency/alarm/test/offline) — not live telemetry.
    status: Mapped[str] = mapped_column(String(20), default="normal", nullable=False)

    company: Mapped["Company"] = relationship(back_populates="systems")
    panels: Mapped[list["Panel"]] = relationship(
        back_populates="system", cascade="all, delete-orphan"
    )
