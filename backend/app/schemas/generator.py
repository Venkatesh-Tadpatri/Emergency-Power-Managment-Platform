from pydantic import BaseModel, ConfigDict


class GeneratorBase(BaseModel):
    name: str
    make: str | None = None
    model: str | None = None
    serial_number: str | None = None
    rated_volts: float | None = None
    rated_amps: float | None = None
    rated_kw: float | None = None
    mqtt_topic: str | None = None
    panel_id: str


class GeneratorCreate(GeneratorBase):
    pass


class GeneratorUpdate(BaseModel):
    name: str | None = None
    make: str | None = None
    model: str | None = None
    serial_number: str | None = None
    rated_volts: float | None = None
    rated_amps: float | None = None
    rated_kw: float | None = None
    mqtt_topic: str | None = None
    panel_id: str | None = None


class GeneratorRead(GeneratorBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
