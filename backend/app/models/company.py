from sqlalchemy import Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class Customer(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "customers"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str | None] = mapped_column(String(500))
    contact_name: Mapped[str | None] = mapped_column(String(255))
    contact_email: Mapped[str | None] = mapped_column(String(255))
    contact_phone: Mapped[str | None] = mapped_column(String(50))
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    reseller_id: Mapped[str] = mapped_column(ForeignKey("resellers.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    logo_data: Mapped[str | None] = mapped_column(Text)
    # CUSTCODE: assigned once when the customer is created and never changed (it prefixes every
    # PNUMBER, e.g. ASTEP01, so it must not follow later renames).
    customer_code: Mapped[str | None] = mapped_column(String(12), index=True)
    notes: Mapped[str | None] = mapped_column(Text)

    reseller: Mapped["Reseller"] = relationship(back_populates="customers")
    sites: Mapped[list["Site"]] = relationship(back_populates="customer", cascade="all, delete-orphan")
    systems: Mapped[list["System"]] = relationship(back_populates="company")

    @property
    def reseller_name(self) -> str | None:
        """Owning reseller's display name, so customer-scoped users (who cannot read the reseller
        record itself) can still see which reseller their customer belongs to."""
        return self.reseller.name if self.reseller else None


# Compatibility name for internal callers while the public API/UI transitions
# to the Customer terminology. Database rows are stored in ``customers``.
Company = Customer
