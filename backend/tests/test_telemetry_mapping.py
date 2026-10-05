import json

from app.services.telemetry import map_payload, normalize_topic


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


def test_topic_normalization():
    assert normalize_topic(" /customer/panel/A1/ ") == "customer/panel/A1"
