from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field, field_serializer


class EquipmentNoteCreate(BaseModel):
    record_key: str = Field(min_length=1, max_length=255)
    text: str = Field(min_length=1, max_length=5000)
    # Only used when moving a note the author previously kept in their own browser into the shared
    # store, so it keeps its original time. Future times are rejected by the router.
    created_at: datetime | None = None


class EquipmentNoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    system_id: str
    record_key: str
    text: str
    author_id: str | None
    author_name: str
    author_email: str | None
    author_role: str | None
    created_at: datetime
    can_delete: bool = False

    @field_serializer("created_at")
    def _utc(self, value: datetime) -> str:
        # Stored as naive UTC; mark it as UTC so browsers convert it to the viewer's local time.
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
