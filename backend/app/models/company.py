from sqlalchemy import Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class Company(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "companies"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str | None] = mapped_column(String(500))
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    reseller_id: Mapped[str] = mapped_column(ForeignKey("resellers.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)

    reseller: Mapped["Reseller"] = relationship(back_populates="companies")
    systems: Mapped[list["System"]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )
