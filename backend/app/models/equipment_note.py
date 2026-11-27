from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class EquipmentNote(Base, UUIDPKMixin, TimestampMixin):
    """A note on one piece of equipment in a system's one-line, shared by every user who can view
    that system. ``record_key`` identifies the equipment within the system (e.g. ``container:DG``).

    The author's name, email and role are snapshotted at the time of writing, so the note keeps its
    original attribution even if the user is later renamed, re-roled or removed.
    """

    __tablename__ = "equipment_notes"

    system_id: Mapped[str] = mapped_column(ForeignKey("systems.id"), nullable=False, index=True)
    record_key: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    author_id: Mapped[str | None] = mapped_column(String(36), index=True)
    author_name: Mapped[str] = mapped_column(String(255), nullable=False)
    author_email: Mapped[str | None] = mapped_column(String(255))
    author_role: Mapped[str | None] = mapped_column(String(50))
