"""Adds a handful of demo Generator Run / ATS Transfer reports for Aster Prime (CMP-0008), across its
SYS-0047 and SYS-0053 systems, using their real generators/ATS units — so the Reports page (calendar,
Initiating ATS Report, Time to Re-Xfer Report) has something to show/generate/download for that customer
instead of all zeros. Safe to re-run — skips if report_code already exists. Run with:
  python -m app.seed.add_demo_reports_aster
"""
from datetime import date, timedelta

from app.database import SessionLocal
from app.models.ats import ATS
from app.models.generator import Generator
from app.models.panel import Panel
from app.models.report import Report
from app.models.system import System
from app.seed.seed_data import _hash_seed, _seeded

COMPANY_ID = "CMP-0008"
SYSTEM_IDS = ["SYS-0047", "SYS-0053"]

# (system_id, days_ago, type, generator_name_or_None, initiating_ats, duration_min, event_type)
PLAN = [
    ("SYS-0053", 45, "gen-run", "Generator-1", "ATS-LI", 47, None),
    ("SYS-0053", 30, "test", None, "ATS-CR", 12, "Test"),
    ("SYS-0053", 21, "ats-emergency", None, "ATS-GEN", 51, "Emergency"),
    ("SYS-0053", 10, "gen-run", "Generator-2", "ATS-EQ1", 35, None),
    ("SYS-0047", 18, "gen-run", "ASTER-GEN-001", "ASTER-ATS-001", 40, None),
    ("SYS-0047", 6, "test", None, "ASTER-ATS-002", 15, "Test"),
]


def build_telemetry_log(rand, base_hour, base_min, duration_min, rated_kw, rated_voltage, start_hours):
    profile = [round(rated_kw * f) for f in (0, .3, .65, .9, 1.0, .95, .8, .55, .25, 0)]
    row_count = min(8, len(profile))
    step = max(1, (len(profile) - 1) // max(1, row_count - 1))
    minutes_per_step = duration_min / max(1, len(profile) - 1) * step
    log = []
    for row_index, sample_index in enumerate(range(0, len(profile), step)):
        if row_index >= row_count:
            break
        kw = profile[sample_index]
        t_total_min = base_min + row_index * minutes_per_step
        t_hour = (base_hour + int(t_total_min // 60)) % 24
        t_min = int(t_total_min % 60)
        amps = round(kw * 1000 / (rated_voltage * 1.732 * 0.9)) if kw else 0
        log.append({
            "time": f"{t_hour:02d}:{t_min:02d}",
            "vab": rated_voltage + rand(-4, 3), "vbc": rated_voltage + rand(-4, 3), "vca": rated_voltage + rand(-4, 3),
            "ia": amps, "ib": amps + rand(-3, 3), "ic": amps + rand(-3, 3),
            "kw": kw, "pct_kw": round((kw / rated_kw) * 100) if rated_kw else 0,
            "oil_psi": 55 + rand(-5, 8), "water_temp_f": 160 + rand(0, 30),
            "batt_v": round(27 + rand(-3, 3) / 10, 1),
            "hours": round(start_hours + row_index * minutes_per_step / 60, 3),
        })
    return log, profile


def add_demo_reports() -> None:
    db = SessionLocal()
    try:
        added = 0
        for system_id, days_ago, r_type, gen_name, initiating_ats, duration_min, event_type in PLAN:
            report_code = f"ASTER-DEMO-{system_id}-{r_type}-{days_ago}"
            if db.query(Report).filter(Report.report_code == report_code).first():
                continue

            system = db.get(System, system_id)
            panel = db.query(Panel).filter(Panel.system_id == system_id).first()
            report_date = date.today() - timedelta(days=days_ago)
            rand = _seeded(_hash_seed(report_code))
            base_hour, base_min = rand(6, 16), rand(0, 59)
            duration_label = f"{duration_min} min" if duration_min < 60 else f"{duration_min // 60}h {duration_min % 60}m"

            extra = {}
            rated_kw = peak_kw = avg_kw = None
            if r_type == "gen-run":
                generator = db.query(Generator).filter(Generator.panel_id == panel.id, Generator.name == gen_name).first()
                rated_kw = generator.rated_kw if generator else 500
                rated_voltage = (generator.rated_volts if generator else None) or 480
                start_hours = round(rand(200, 900) + rand(0, 99) / 100, 2)
                log, profile = build_telemetry_log(rand, base_hour, base_min, duration_min, rated_kw, rated_voltage, start_hours)
                peak_kw = max(profile)
                avg_kw = round(sum(profile) / len(profile))
                extra = {
                    "make": generator.make if generator else None,
                    "model": generator.model if generator else None,
                    "serial_number": f"G{rand(10, 99)}-{rand(2020, 2025)}-{rand(1, 999):03d}",
                    "rated_voltage": rated_voltage,
                    "rated_amperage": (generator.rated_amps if generator else None) or round(rated_kw * 1000 / (rated_voltage * 1.732 * 0.9)),
                    "start_hours": start_hours,
                    "end_hours": round(start_hours + duration_min / 60, 2),
                    "telemetry_log": log,
                }
            else:
                ats_rows = db.query(ATS).filter(ATS.panel_id == panel.id).all()
                to_normal_total_min = base_min + duration_min
                to_normal_hour = (base_hour + to_normal_total_min // 60) % 24
                to_normal_min = to_normal_total_min % 60
                ats_details = []
                for a in ats_rows:
                    switch_sec = rand(3, 12)
                    ats_details.append({
                        "ats_name": a.name,
                        "branch": a.branch,
                        "manufacturer": a.manufacturer,
                        "serial_number": a.serial_number,
                        "switched_to_emergency": f"{base_hour % 12 or 12}:{base_min:02d}:{rand(0, 59):02d} {'AM' if base_hour < 12 else 'PM'}",
                        "switched_to_normal": f"{to_normal_hour % 12 or 12}:{to_normal_min:02d}:{rand(0, 59):02d} {'AM' if to_normal_hour < 12 else 'PM'}",
                        "time_to_bus_sec": switch_sec,
                        "time_to_available_sec": round(switch_sec * rand(60, 90) / 100, 1),
                        "on_emergency_duration": duration_label,
                    })
                extra = {"event_type": event_type, "ats_details": ats_details}

            db.add(Report(
                company_id=COMPANY_ID,
                system_id=system_id,
                report_code=report_code,
                type=r_type,
                report_date=report_date,
                time_label=f"{base_hour:02d}:{base_min:02d}",
                duration_label=duration_label,
                duration_min=duration_min,
                initiating_ats=initiating_ats,
                rated_kw=rated_kw,
                peak_kw=peak_kw,
                avg_kw=avg_kw,
                load_profile_data=profile if r_type == "gen-run" else None,
                **extra,
            ))
            added += 1

        db.commit()
        print(f"Added {added} demo report(s) for {COMPANY_ID}.")
    finally:
        db.close()


if __name__ == "__main__":
    add_demo_reports()
