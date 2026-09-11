"""One-off backfill for reports created before the Generator Run / ATS Transfer detail fields
(migration 0012) existed. Safe to re-run — only fills rows where telemetry_log/ats_details is still
NULL, and only touches the reports table. Run with:  python -m app.seed.backfill_report_details
"""
from app.database import SessionLocal
from app.models.ats import ATS
from app.models.generator import Generator
from app.models.panel import Panel
from app.models.report import Report
from app.seed.seed_data import _hash_seed, _seeded


def backfill() -> None:
    db = SessionLocal()
    try:
        reports = db.query(Report).filter(
            (Report.telemetry_log.is_(None)) | (Report.ats_details.is_(None))
        ).all()
        updated = 0
        for r in reports:
            rand = _seeded(_hash_seed(r.report_code))
            base_hour, base_min = (int(part) for part in (r.time_label or "00:00").split(":"))
            panel = db.query(Panel).filter(Panel.system_id == r.system_id).first()

            if r.type == "gen-run" and r.telemetry_log is None:
                generator = db.query(Generator).filter(Generator.panel_id == panel.id).first() if panel else None
                rated_kw = r.rated_kw or (generator.rated_kw if generator else None) or 1
                rated_voltage = (generator.rated_volts if generator else None) or 480
                rated_amperage = (generator.rated_amps if generator else None) or round(rated_kw * 1000 / (rated_voltage * 1.732 * 0.9))

                profile = r.load_profile_data or [0]
                row_count = min(8, len(profile))
                step = max(1, (len(profile) - 1) // max(1, row_count - 1)) if len(profile) > 1 else 1
                minutes_per_step = (r.duration_min or 0) / max(1, len(profile) - 1) * step if len(profile) > 1 else 0
                start_hours = round(rand(200, 900) + rand(0, 99) / 100, 2)

                telemetry_log = []
                for row_index, sample_index in enumerate(range(0, len(profile), step)):
                    if row_index >= row_count:
                        break
                    kw = profile[sample_index]
                    t_total_min = base_min + row_index * minutes_per_step
                    t_hour = (base_hour + int(t_total_min // 60)) % 24
                    t_min = int(t_total_min % 60)
                    amps = round(kw * 1000 / (rated_voltage * 1.732 * 0.9)) if kw else 0
                    telemetry_log.append({
                        "time": f"{t_hour:02d}:{t_min:02d}",
                        "vab": rated_voltage + rand(-4, 3), "vbc": rated_voltage + rand(-4, 3), "vca": rated_voltage + rand(-4, 3),
                        "ia": amps, "ib": amps + rand(-3, 3), "ic": amps + rand(-3, 3),
                        "kw": kw, "pct_kw": round((kw / rated_kw) * 100) if rated_kw else 0,
                        "oil_psi": 55 + rand(-5, 8), "water_temp_f": 160 + rand(0, 30),
                        "batt_v": round(27 + rand(-3, 3) / 10, 1),
                        "hours": round(start_hours + row_index * minutes_per_step / 60, 3),
                    })

                r.make = generator.make if generator else None
                r.model = generator.model if generator else None
                r.serial_number = f"G{rand(10, 99)}-{rand(2020, 2025)}-{rand(1, 999):03d}"
                r.rated_voltage = rated_voltage
                r.rated_amperage = rated_amperage
                r.start_hours = start_hours
                r.end_hours = round(start_hours + (r.duration_min or 0) / 60, 2)
                r.telemetry_log = telemetry_log
                updated += 1

            elif r.type in ("ats-emergency", "test") and r.ats_details is None:
                ats_rows = db.query(ATS).filter(ATS.panel_id == panel.id).all() if panel else []
                to_normal_total_min = base_min + (r.duration_min or 0)
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
                        "on_emergency_duration": r.duration_label,
                    })
                r.event_type = "Test" if r.type == "test" else "Emergency"
                r.ats_details = ats_details
                updated += 1

        db.commit()
        print(f"Backfilled {updated} report(s).")
    finally:
        db.close()


if __name__ == "__main__":
    backfill()
