from datetime import date

from pydantic import BaseModel, ConfigDict


class GeneratorBase(BaseModel):
    name: str
    make: str | None = None
    model: str | None = None
    serial_number: str | None = None
    rated_volts: float | None = None
    rated_amps: float | None = None
    rated_kw: float | None = None
    rated_kva: float | None = None
    description: str | None = None
    fuel_type: str | None = None
    engine: str | None = None
    controller: str | None = None
    install_date: date | None = None
    location: str | None = None
    notes: str | None = None
    mqtt_topic: str | None = None
    power_mqtt_topic: str | None = None
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
    rated_kva: float | None = None
    description: str | None = None
    fuel_type: str | None = None
    engine: str | None = None
    controller: str | None = None
    install_date: date | None = None
    location: str | None = None
    notes: str | None = None
    mqtt_topic: str | None = None
    power_mqtt_topic: str | None = None
    panel_id: str | None = None


class GeneratorRead(GeneratorBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
