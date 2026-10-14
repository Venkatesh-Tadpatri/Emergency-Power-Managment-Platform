from pydantic import BaseModel, ConfigDict


class PanelBase(BaseModel):
    name: str
    panel_mqtt_id: str | None = None
    system_id: str
    connection_status: str = "unknown"
    plc_serial: str | None = None
    location: str | None = None
    slot_count: int = 10
    sync_status: str = "pending"


class PanelCreate(PanelBase):
    pass


class PanelUpdate(BaseModel):
    name: str | None = None
    panel_mqtt_id: str | None = None
    system_id: str | None = None
    connection_status: str | None = None
    plc_serial: str | None = None
    location: str | None = None
    slot_count: int | None = None
    sync_status: str | None = None


class PanelRead(PanelBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
