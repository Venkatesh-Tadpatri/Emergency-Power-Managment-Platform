from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class IDSequence(Base):
    """Per-prefix counters used to allocate readable entity IDs."""

    __tablename__ = "id_sequences"

    prefix: Mapped[str] = mapped_column(String(10), primary_key=True)
    next_value: Mapped[int] = mapped_column(Integer, nullable=False)
