from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class Reseller(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "resellers"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_name: Mapped[str | None] = mapped_column(String(255))
    contact_email: Mapped[str | None] = mapped_column(String(255))
    contact_phone: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)

    customers: Mapped[list["Customer"]] = relationship(
        back_populates="reseller", cascade="all, delete-orphan"
    )
