from pydantic import BaseModel, ConfigDict


class PanelBase(BaseModel):
    name: str
    panel_mqtt_id: str | None = None
    system_id: str
    connection_status: str = "unknown"


class PanelCreate(PanelBase):
    pass


class PanelUpdate(BaseModel):
    name: str | None = None
    panel_mqtt_id: str | None = None
    system_id: str | None = None
    connection_status: str | None = None


class PanelRead(PanelBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
