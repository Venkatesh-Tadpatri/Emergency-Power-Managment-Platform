import json

from app.services.telemetry import map_payload, normalize_topic, topic_matches_base


def test_power_metrics_are_mapped_by_position():
    payload = json.dumps({"metrics": [479, 481, 482, 279, 280, 278, 112, 88, 112, 99]})

    assert map_payload("device/M1/POWER", payload) == {
        "voltage_l1_l2_v": 479,
        "voltage_l2_l3_v": 481,
        "voltage_l3_l1_v": 482,
        "voltage_l1_n_v": 279,
        "voltage_l2_n_v": 280,
        "voltage_l3_n_v": 278,
        "current_l1_a": 112,
        "current_l2_a": 88,
        "current_l3_a": 112,
        "active_power_kw": 99,
    }


def test_ats_status_metrics_are_mapped_by_position():
    assert map_payload("device/A1/STATUS", b'{"metrics":[3,0,0]}') == {
        "status_word": 3,
        "time_to_bus_seconds": 0,
        "time_to_transfer_seconds": 0,
    }


def test_tstp03_m4_power_maps_excel_phase_to_neutral_fields():
    payload = json.dumps({"metrics": [479, 479, 480, 277, 276, 278, 54, 53, 55, 40]})

    mapped = map_payload("TSTP03/M4/POWER", payload)

    assert mapped["voltage_l1_n_v"] == 277
    assert mapped["voltage_l2_n_v"] == 276
    assert mapped["voltage_l3_n_v"] == 278
    assert mapped["active_power_kw"] == 40


def test_topic_normalization():
    assert normalize_topic(" /customer/panel/A1/ ") == "customer/panel/A1"


def test_current_mapping_accepts_child_topic_and_rejects_old_topic():
    assert topic_matches_base("TSTP01/M3/POWER", {"TSTP03/G1", "TSTP01/M3"})
    assert not topic_matches_base("TSTP01/M1/POWER", {"TSTP03/G1", "TSTP01/M3"})


def test_excel_style_csv_generator_status_payload():
    assert map_payload("SERIAL/DEMO/P01/G1/STATUS", "3,45,82,26.4,74,119.5") == {
        "status_word": 3,
        "oil_pressure_psi": 45,
        "coolant_temperature_c": 82,
        "battery_voltage": 26.4,
        "fuel_level_percent": 74,
        "engine_hours": 119.5,
    }


def test_values_json_array_is_accepted():
    assert map_payload("SERIAL/DEMO/P01/A1/STATUS", '{"values":[9,12,4]}') == {
        "status_word": 9,
        "time_to_bus_seconds": 12,
        "time_to_transfer_seconds": 4,
    }


def test_fuel_tank_payload_maps_level_and_gallons():
    assert map_payload("SERIAL/CUST/P01/F1/FUEL", '{"metrics":[72.5,1450]}') == {
        "fuel_level_percent": 72.5,
        "fuel_volume_gallons": 1450,
    }
