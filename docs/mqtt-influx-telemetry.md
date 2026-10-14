# MQTT to InfluxDB telemetry

## Data ownership

MySQL remains the source of truth for reseller -> customer -> site -> system -> panel -> device ownership.
The `mqtt_topic_mappings` table binds one normalized PLC base topic to exactly one ATS or generator.
Both `base_topic` and `(device_type, device_id)` are unique, so a topic cannot feed two systems.

InfluxDB stores time-series points in the `device_telemetry` measurement. Every point is tagged with
`company_id`, `site_id`, `system_id`, `panel_id`, `device_type`, and `device_id`. API reads filter by
the selected `system_id` and its registered device IDs, preventing telemetry from another system from
appearing in Engine data or Electrical data.

## Configure a device

1. Open the required system.
2. Add or edit its ATS/generator.
3. Enter only the base topic, for example `00:E0:62:30:D3:5A/DEMO/P01/G1`.
   For an ATS, enter its `A1` status base and optionally its separate `M1` electrical meter base.
4. Save. MySQL automatically creates or updates the system-scoped mapping.
5. The subscriber reads `<base>/STATUS` and `<base>/POWER`.

The base topic follows the supplied PLC sheet:

`PLC-SERIAL/CUSTOMER-CODE/PANEL/DEVICE`

Device identifiers are `A1..A4` for ATS, `G1` for generator, and `M1..M4` for meters. The current
application screen consumes ATS and generator mappings; meter ingestion can use the same hierarchy
when meters are promoted to standalone system devices.

## Accepted payloads

The subscriber accepts CSV (`3,45,82,26.4,74,119.5`), a JSON array, or a JSON object containing a
`metrics` or `values` array. Numeric strings are converted safely; non-numeric values are ignored.

The bridge caches the latest valid message for every mapped device and writes a new InfluxDB snapshot
every `TELEMETRY_SAMPLE_INTERVAL_SECONDS` (five seconds by default) while MQTT is connected. Therefore,
one minute of healthy operation produces approximately 12 timestamped rows per device, even if the
published values do not change. It does not create misleading history while the broker is disconnected.

- Generator `STATUS`: status word, oil pressure, water temperature, battery voltage, fuel level, hours.
- ATS `STATUS`: status word, time to bus, time to transfer.
- `POWER`: VAB, VBC, VCA, VAN, VBN, VCN, Amps A, Amps B, Amps C, kW.
- Generator `POWER` may additionally include kVA, kVAR, Hz, and power factor.

Generator status bits: running=0, alarm=1, not-in-auto=2. ATS status bits: normal available=0,
normal connected=1, emergency available=2, emergency connected=3, test mode=4.

## Runtime checks

- `GET /api/telemetry/status` reports broker connectivity, the last received topic, and connection errors.
- `GET /api/telemetry/systems/{system_id}/topics` lists the mappings visible to the signed-in user.
- `GET /api/telemetry/systems/{system_id}/latest` returns only that system's latest InfluxDB values.

Required environment variables are `MQTT_ENABLED`, `MQTT_HOST`, `MQTT_PORT`, `MQTT_USERNAME`,
`MQTT_PASSWORD`, `MQTT_TOPIC_FILTER`, `MQTT_TLS`, `INFLUXDB_URL`, `INFLUXDB_TOKEN`, `INFLUXDB_ORG`,
and `INFLUXDB_BUCKET`. Restart the backend after changing connection settings.
