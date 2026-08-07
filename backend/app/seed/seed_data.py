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

    system_ids: dict[str, str] = {}
    system_company_of: dict[str, str] = {}
    ats_id_by_system_and_code: dict[str, dict[str, str]] = {}

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

        system_row = System(
            name=s["name"],
            address=company["city"],
            lat=lat,
            lng=lng,
            company_id=company_ids[company_slug],
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
            ats_lookup = {}
            for a in PIE_GLD_ATS:
                ats_row = ATS(panel_id=panel.id, **a)
                db.add(ats_row)
                db.flush()
                ats_lookup[a["name"]] = ats_row.id
            ats_id_by_system_and_code[slug] = ats_lookup
            continue

        rand = _seeded(_hash_seed(slug))
        make, models = GEN_MAKES[rand(0, len(GEN_MAKES) - 1)]
        model = models[rand(0, len(models) - 1)]
        kw_per_ats = rand(100, 200)
        rated_kw = round((ats_count * kw_per_ats) / 50) * 50

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
        db.add(
            User(
                zitadel_sub=settings.superadmin_zitadel_sub,
                email=settings.superadmin_email,
                display_name="Superadmin",
                role="superadmin",
                is_active=True,
            )
        )

    db.commit()
