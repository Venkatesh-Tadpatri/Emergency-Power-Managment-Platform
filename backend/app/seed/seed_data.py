"""Idempotent seed entrypoint. Run automatically on backend startup when
SEED_ON_START=true (see entrypoint.sh); skips entirely if any reseller already
exists, so re-running `docker compose up` never duplicates data.
"""
from datetime import date, datetime

from sqlalchemy.orm import Session

from app.config import settings
from app.models.alarm import Alarm
from app.models.ats import ATS
from app.models.company import Company
from app.models.generator import Generator
from app.models.oncall import OnCallShift
from app.models.panel import Panel
from app.models.report import Report
from app.models.reseller import Reseller
from app.models.site import Site
from app.models.system import System
from app.models.user import User
from app.seed.demo_fixtures import (
    ALARMS,
    COMPANIES,
    ONCALL,
    PIE_GLD_ATS,
    PIE_GLD_GENERATOR,
    REPORTS,
    RESELLERS,
    SYSTEMS,
)

GEN_MAKES = [
    ("Cummins", ["DQKAB", "QSX15-G9", "C1100D5", "DQFAD"]),
    ("Caterpillar", ["C15", "C18", "C32", "3512B"]),
    ("Kohler", ["KD800", "KD1000", "KD1250", "80REZG"]),
    ("Generac", ["SD600", "MD500", "SG300", "QT070"]),
]
BRANCHES = [
    ("life-safety", ["Fire alarms, exit lighting"]),
    ("critical", ["OR suites, ICU"]),
    ("equipment", ["HVAC, elevators", "Imaging, labs", "Kitchen, laundry", "Data center, comms"]),
]


def _hash_seed(key: str) -> int:
    h = 0
    for ch in key:
        h = ((h << 5) - h + ord(ch)) & 0xFFFFFFFF
        if h >= 0x80000000:
            h -= 0x100000000
    return abs(h)


def _seeded(seed: int):
    state = {"s": seed}

    def rand(lo: int, hi: int) -> int:
        state["s"] = (state["s"] * 16807) % 2147483647
        return lo + (state["s"] % (hi - lo + 1))

    return rand


def seed(db: Session) -> None:
    if db.query(Reseller).first() is not None:
        return  # already seeded

    reseller_ids: dict[str, str] = {}
    for slug, r in RESELLERS.items():
        row = Reseller(name=r["name"], status="active")
        db.add(row)
        db.flush()
        reseller_ids[slug] = row.id

    company_ids: dict[str, str] = {}
    company_reseller_of: dict[str, str] = {}
    for slug, c in COMPANIES.items():
        row = Company(
            name=c["name"],
            address=c["city"],
            lat=c["lat"],
            lng=c["lng"],
            reseller_id=reseller_ids[c["reseller"]],
            status="active",
        )
        db.add(row)
        db.flush()
        company_ids[slug] = row.id
        company_reseller_of[slug] = c["reseller"]
    db.flush()

    # Demo customers have multiple physical sites. Aster Prime deliberately
    # mirrors the Hyderabad hospital example: Ameerpet, Gachibowli,
    # Jubilee Hills, and Miyapur. Systems are assigned to their site below.
    site_names_by_customer = {
        "piedmont": ["Main Hospital", "Ameerpet Campus", "Gachibowli Campus"],
        "msk": ["Ameerpet Hospital", "Gachibowli Hospital", "Jubilee Hills Hospital", "Miyapur Hospital"],
        "duke": ["Main Campus", "Raleigh Campus", "Regional Campus"],
        "nyu": ["Tisch Campus", "Kimmel Campus", "Science Campus"],
        "jhu": ["Weinberg Campus", "Bloomberg Campus"],
        "unc": ["Main Hospital", "Cancer Hospital", "Hillsborough Campus"],
        "capefear": ["Main Hospital", "Rehabilitation Center", "Health Pavilion"],
    }
    site_ids: dict[tuple[str, str], str] = {}
    for customer_slug, site_names in site_names_by_customer.items():
        customer = COMPANIES[customer_slug]
        for site_name in site_names:
            site = Site(
                name=site_name,
                address=customer["city"],
                lat=customer["lat"],
                lng=customer["lng"],
                customer_id=company_ids[customer_slug],
                status="active",
            )
            db.add(site)
            db.flush()
            site_ids[(customer_slug, site_name)] = site.id

    system_ids: dict[str, str] = {}
    system_company_of: dict[str, str] = {}
    ats_id_by_system_and_code: dict[str, dict[str, str]] = {}
    # Captured per system while its generator/ATS rows are created below, then reused when building
    # each Report row's Generator Run / ATS Transfer detail fields — keeps a report's synthesized specs
    # consistent with the actual equipment record for that system instead of re-deriving separately.
    gen_specs_by_system: dict[str, dict] = {}
    ats_rows_by_system: dict[str, list[ATS]] = {}

    for slug, s in SYSTEMS.items():
        company_slug = s["company"]
        company = COMPANIES[company_slug]
        # Spread systems out slightly around the company's coordinates so map pins
        # don't all stack on one point, matching the demo's map behavior.
        idx = company["systems"].index(slug)
        jitter = 0.004 * (idx**0.5)
        angle = idx * 2.399 + 0.5
        lat = company["lat"] + (jitter * __import__("math").cos(angle) if idx else 0)
        lng = company["lng"] + (jitter * __import__("math").sin(angle) if idx else 0)

        site_names = site_names_by_customer[company_slug]
        site_name = site_names[idx % len(site_names)]

        system_row = System(
            name=s["name"],
            address=company["city"],
            lat=lat,
            lng=lng,
            company_id=company_ids[company_slug],
            site_id=site_ids[(company_slug, site_name)],
            status=s["status"],
        )
        db.add(system_row)
        db.flush()
        system_ids[slug] = system_row.id
        system_company_of[slug] = company_slug

        panel = Panel(
            name="Main Panel",
            panel_mqtt_id="P01",
            system_id=system_row.id,
            connection_status="online",
        )
        db.add(panel)
        db.flush()

        ats_count = s["atsCount"]
        gen_count = s["genCount"]

        if slug == "pie-gld":
            gen = Generator(panel_id=panel.id, **PIE_GLD_GENERATOR)
            db.add(gen)
            gen_specs_by_system[slug] = dict(PIE_GLD_GENERATOR)
            ats_lookup = {}
            ats_rows_by_system[slug] = []
            for a in PIE_GLD_ATS:
                ats_row = ATS(panel_id=panel.id, **a)
                db.add(ats_row)
                db.flush()
                ats_lookup[a["name"]] = ats_row.id
                ats_rows_by_system[slug].append(ats_row)
            ats_id_by_system_and_code[slug] = ats_lookup
            continue

        rand = _seeded(_hash_seed(slug))
        make, models = GEN_MAKES[rand(0, len(GEN_MAKES) - 1)]
        model = models[rand(0, len(models) - 1)]
        kw_per_ats = rand(100, 200)
        rated_kw = round((ats_count * kw_per_ats) / 50) * 50
        gen_specs_by_system[slug] = {
            "make": make, "model": model, "rated_kw": rated_kw,
            "rated_volts": 480, "rated_amps": round(rated_kw * 1000 / (480 * 1.732 * 0.9)),
        }

        for g in range(gen_count):
            db.add(
                Generator(
                    name=f"GEN-{slug.split('-')[-1].upper()}{g + 1 if gen_count > 1 else ''}",
                    make=make,
                    model=model,
                    serial_number=f"S{rand(100000, 999999)}",
                    rated_kw=rated_kw,
                    rated_volts=480,
                    rated_amps=round(rated_kw * 1000 / (480 * 1.732 * 0.9)),
                    panel_id=panel.id,
                )
            )

        ats_lookup = {}
        ats_rows_by_system[slug] = []
        for i in range(ats_count):
            branch, descs = BRANCHES[min(i, len(BRANCHES) - 1)]
            suffix = "" if i < 2 else str(i - 1)
            kw = rand(40, max(41, round(rated_kw / ats_count * 1.2)))
            volts = 480 if rand(0, 1) else 208
            amps = round(kw * 1000 / (volts * 1.732 * 0.97))
            code = f"ATS-{branch[:2].upper()}{suffix}"
            ats_row = ATS(
                name=code,
                manufacturer="ASCO" if rand(0, 2) == 0 else make,
                serial_number=f"G{rand(10, 99)}M{rand(100000, 999999)}",
                branch=branch,
                rated_amps=amps,
                rated_volts=volts,
                panel_id=panel.id,
            )
            db.add(ats_row)
            db.flush()
            ats_lookup[code] = ats_row.id
            ats_rows_by_system[slug].append(ats_row)
        ats_id_by_system_and_code[slug] = ats_lookup

    db.flush()

    for a in ALARMS:
        db.add(
            Alarm(
                system_id=system_ids[a["system"]],
                device_label=a["device"],
                severity=a["severity"],
                message=a["message"],
                status=a["status"],
                occurred_at=datetime.strptime(f"{a['date']} {a['time']}", "%Y-%m-%d %H:%M:%S"),
                ack_by=a["ack_by"],
                ack_at=datetime.strptime(a["ack_at"], "%Y-%m-%d %H:%M:%S") if a["ack_at"] else None,
            )
        )

    for r in REPORTS:
        system_slug = r["system"]
        company_slug = system_company_of[system_slug]
        rand = _seeded(_hash_seed(r["id"]))
        base_hour, base_min = (int(part) for part in r["time"].split(":"))
        extra: dict = {}

        if r["type"] == "gen-run":
            spec = gen_specs_by_system.get(system_slug, {})
            rated_kw = r["ratedKW"] or spec.get("rated_kw") or 1
            rated_voltage = spec.get("rated_volts", 480)
            rated_amperage = spec.get("rated_amps") or round(rated_kw * 1000 / (rated_voltage * 1.732 * 0.9))
            start_hours = round(rand(200, 900) + rand(0, 99) / 100, 2)
            end_hours = round(start_hours + r["durationMin"] / 60, 2)

            # A handful of readable rows, resampled from the same load-profile array the chart already
            # draws from, rather than a fabricated separate series — so the table and chart always agree.
            profile = r["loadProfile"] or [0]
            row_count = min(8, len(profile))
            step = max(1, (len(profile) - 1) // max(1, row_count - 1)) if len(profile) > 1 else 1
            minutes_per_step = r["durationMin"] / max(1, len(profile) - 1) * step if len(profile) > 1 else 0
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
            extra = {
                "make": spec.get("make"), "model": spec.get("model"),
                "serial_number": f"G{rand(10, 99)}-{rand(2020, 2025)}-{rand(1, 999):03d}",
                "rated_voltage": rated_voltage, "rated_amperage": rated_amperage,
                "start_hours": start_hours, "end_hours": end_hours, "telemetry_log": telemetry_log,
            }
        else:
            ats_rows = ats_rows_by_system.get(system_slug, [])
            to_normal_total_min = base_min + r["durationMin"]
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
                    "on_emergency_duration": r["duration"],
                })
            extra = {
                "event_type": "Test" if r["type"] == "test" else "Emergency",
                "ats_details": ats_details,
            }

        db.add(
            Report(
                company_id=company_ids[company_slug],
                system_id=system_ids[system_slug],
                report_code=r["id"],
                type=r["type"],
                report_date=date.fromisoformat(r["date"]),
                time_label=r["time"],
                duration_label=r["duration"],
                duration_min=r["durationMin"],
                initiating_ats=r["initiatingAts"],
                rated_kw=r["ratedKW"],
                peak_kw=r["peakKW"],
                avg_kw=r["avgKW"],
                load_profile_data=r["loadProfile"],
                **extra,
            )
        )

    for company_slug, shifts in ONCALL.items():
        for sh in shifts:
            db.add(
                OnCallShift(
                    company_id=company_ids[company_slug],
                    shift_date=date.fromisoformat(sh["date"]),
                    day_label=sh["day"],
                    primary_name=sh["primary"],
                    secondary_name=sh["secondary"],
                    shift_label="24h",
                )
            )

    # Bootstrapped Zitadel admin -> local superadmin, per docker-compose.yml's
    # ZITADEL_FIRSTINSTANCE_* vars and scripts/bootstrap_zitadel.py.
    if settings.superadmin_zitadel_sub:
        admin = db.query(User).filter(User.zitadel_sub == settings.superadmin_zitadel_sub).one_or_none()
        if admin is None:
            admin = User(zitadel_sub=settings.superadmin_zitadel_sub, email=settings.superadmin_email)
            db.add(admin)
        admin.email = settings.superadmin_email
        admin.display_name = "Superadmin"
        admin.role = "superadmin"
        admin.is_active = True

    db.commit()
