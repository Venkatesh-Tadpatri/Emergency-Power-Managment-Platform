from sqlalchemy import Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class Generator(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "generators"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    make: Mapped[str | None] = mapped_column(String(100))
    model: Mapped[str | None] = mapped_column(String(100))
    serial_number: Mapped[str | None] = mapped_column(String(100))
    rated_volts: Mapped[float | None] = mapped_column(Float)
    rated_amps: Mapped[float | None] = mapped_column(Float)
    rated_kw: Mapped[float | None] = mapped_column(Float)
    panel_id: Mapped[str] = mapped_column(ForeignKey("panels.id"), nullable=False)

    panel: Mapped["Panel"] = relationship(back_populates="generators")
