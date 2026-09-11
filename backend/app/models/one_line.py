from sqlalchemy import JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class OneLine(Base, UUIDPKMixin, TimestampMixin):
    """The One-Line Wizard's saved equipment/connections model for a system — one row per system."""

    __tablename__ = "system_one_lines"

    system_id: Mapped[str] = mapped_column(ForeignKey("systems.id"), nullable=False, unique=True)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)
