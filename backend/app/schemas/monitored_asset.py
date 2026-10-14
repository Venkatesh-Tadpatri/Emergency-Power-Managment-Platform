from datetime import date, datetime
from pydantic import BaseModel, ConfigDict


class MonitoredAssetBase(BaseModel):
    system_id: str
    panel_id: str | None = None
    asset_type: str
    asset_tag: str
    description: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    serial_number: str | None = None
    install_date: date | None = None
    location: str | None = None
    slot: str | None = None
    connection_mode: str = "plc"
    mqtt_topic: str | None = None
    command_topic: str | None = None
    power_topic: str | None = None
    controller: str | None = None
    meter_model: str | None = None
    measured_asset_id: str | None = None
    branch: str | None = None
    rating_amps: float | None = None
    rating_kw: float | None = None
    rating_kva: float | None = None
    voltage: float | None = None
    fuel_type: str | None = None
    engine: str | None = None
    measures: str | None = None
    ct_ratio: str | None = None
    pt_ratio: str | None = None
    voltage_label: str | None = None
    trip_amps: float | None = None
    interrupting_ka: float | None = None
    trip_unit: str | None = None
    fed_from: str | None = None
    feeds: str | None = None
    input_voltage: str | None = None
    output_voltage: str | None = None
    topology: str | None = None
    battery: str | None = None
    runtime_minutes: float | None = None
    tank_read_mode: str | None = None
    tank_gauge_model: str | None = None
    served_generator_ids: list[str] | None = None
    capacity_gal: float | None = None
    tank_type: str | None = None
    construction: str | None = None
    low_level_percent: float | None = None
    runtime_hours: float | None = None
    poles: str | None = None
    transition_type: str | None = None
    linked_asset_id: str | None = None
    notes: str | None = None
    status: str = "pending"


class MonitoredAssetCreate(MonitoredAssetBase): pass


class MonitoredAssetUpdate(BaseModel):
    panel_id: str | None = None
    asset_type: str | None = None
    asset_tag: str | None = None
    description: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    serial_number: str | None = None
    install_date: date | None = None
    location: str | None = None
    slot: str | None = None
    connection_mode: str | None = None
    mqtt_topic: str | None = None
    command_topic: str | None = None
    power_topic: str | None = None
    controller: str | None = None
    meter_model: str | None = None
    measured_asset_id: str | None = None
    branch: str | None = None
    rating_amps: float | None = None
    rating_kw: float | None = None
    rating_kva: float | None = None
    voltage: float | None = None
    fuel_type: str | None = None
    engine: str | None = None
    measures: str | None = None
    ct_ratio: str | None = None
    pt_ratio: str | None = None
    voltage_label: str | None = None
    trip_amps: float | None = None
    interrupting_ka: float | None = None
    trip_unit: str | None = None
    fed_from: str | None = None
    feeds: str | None = None
    input_voltage: str | None = None
    output_voltage: str | None = None
    topology: str | None = None
    battery: str | None = None
    runtime_minutes: float | None = None
    tank_read_mode: str | None = None
    tank_gauge_model: str | None = None
    served_generator_ids: list[str] | None = None
    capacity_gal: float | None = None
    tank_type: str | None = None
    construction: str | None = None
    low_level_percent: float | None = None
    runtime_hours: float | None = None
    poles: str | None = None
    transition_type: str | None = None
    linked_asset_id: str | None = None
    notes: str | None = None
    status: str | None = None


class MonitoredAssetRead(MonitoredAssetBase):
    model_config = ConfigDict(from_attributes=True)
    id: str


class PanelPushRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    panel_id: str
    pushed_at: datetime
    pushed_by: str | None
    summary: str
    status: str
