from sqlalchemy import Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class Site(Base, UUIDPKMixin, TimestampMixin):
    """A physical customer location that contains one or more power systems."""

    __tablename__ = "sites"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str | None] = mapped_column(String(500))
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)

    customer: Mapped["Customer"] = relationship(back_populates="sites")
    systems: Mapped[list["System"]] = relationship(back_populates="site")
