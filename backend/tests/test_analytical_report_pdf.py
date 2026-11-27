from datetime import date
from types import SimpleNamespace

from app.services.analytical_report_pdf import build_initiating_ats_pdf, build_time_to_buss_pdf, is_exceeded, time_to_buss_rows


def report(day, details, type_="test", initiating="ATS-1"):
    return SimpleNamespace(report_date=day, type=type_, event_type=None, time_label="10:00", initiating_ats=initiating,
                           system_id="SYS-1", ats_details=details)


READINGS = [
    report(date(2026, 8, 10), [
        {"ats_name": "ATS-LS", "branch": "life-safety", "time_to_bus_sec": 11, "time_to_available_sec": 9.8},
        {"ats_name": "ATS-CR", "branch": "critical", "time_to_bus_sec": 9, "time_to_available_sec": 6.8},
        {"ats_name": "ATS-EQ", "branch": "equipment", "time_to_bus_sec": 12, "time_to_available_sec": 8.9},
    ]),
    report(date(2025, 1, 1), [{"ats_name": "ATS-OLD", "branch": "critical", "time_to_bus_sec": 4}]),
]
START, END = date(2026, 1, 1), date(2026, 12, 31)


def test_equipment_is_never_flagged_exceeded():
    assert is_exceeded({"branch": "life-safety", "time_to_bus_sec": 11})
    assert is_exceeded({"branch": "critical", "time_to_bus_sec": 10.5})
    assert not is_exceeded({"branch": "equipment", "time_to_bus_sec": 12})
    assert not is_exceeded({"branch": "critical", "time_to_bus_sec": 10})


def test_date_branch_and_omit_filters():
    assert [d["ats_name"] for _, d in time_to_buss_rows(READINGS, START, END)] == ["ATS-LS", "ATS-CR", "ATS-EQ"]
    assert [d["ats_name"] for _, d in time_to_buss_rows(READINGS, START, END, "equipment")] == ["ATS-EQ"]
    assert [d["ats_name"] for _, d in time_to_buss_rows(READINGS, START, END, omit_over_limit=True)] == ["ATS-CR"]


def test_both_pdfs_render():
    for pdf in (
        build_time_to_buss_pdf(READINGS, "Aster Prime", START, END, "all", False),
        build_time_to_buss_pdf([], "Aster Prime", START, END, "critical", True),
        build_initiating_ats_pdf(READINGS, "Aster Prime", {"SYS-1": "Plant"}, START, END),
    ):
        assert pdf.startswith(b"%PDF") and len(pdf) > 1000
