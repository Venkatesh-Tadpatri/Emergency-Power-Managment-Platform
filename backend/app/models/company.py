from sqlalchemy import Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class Customer(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "customers"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str | None] = mapped_column(String(500))
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    reseller_id: Mapped[str] = mapped_column(ForeignKey("resellers.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    logo_data: Mapped[str | None] = mapped_column(Text)

    reseller: Mapped["Reseller"] = relationship(back_populates="customers")
    sites: Mapped[list["Site"]] = relationship(back_populates="customer", cascade="all, delete-orphan")
    systems: Mapped[list["System"]] = relationship(back_populates="company")


# Compatibility name for internal callers while the public API/UI transitions
# to the Customer terminology. Database rows are stored in ``customers``.
Company = Customer
