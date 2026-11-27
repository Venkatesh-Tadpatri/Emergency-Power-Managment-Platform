from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models.ats import ATS
from app.models.base import Base
from app.models.company import Company
from app.models.generator import Generator
from app.models.monitored_asset import MonitoredAsset
from app.models.panel import Panel
from app.models.reseller import Reseller
from app.models.site import Site
from app.models.system import System
from app.routers.monitored_assets import remove_operational_device, sync_operational_device


def make_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = Session(engine)
    reseller = Reseller(name="Reseller")
    db.add(reseller)
    db.flush()
    company = Company(name="Company", reseller_id=reseller.id)
    db.add(company)
    db.flush()
    site = Site(name="Site", customer_id=company.id)
    db.add(site)
    db.flush()
    system = System(name="System", company_id=company.id, site_id=site.id)
    db.add(system)
    db.flush()
    panel = Panel(name="Panel", system_id=system.id)
    db.add(panel)
    db.flush()
    return db, system, panel


def test_generator_commissioning_record_creates_live_device_with_same_id():
    db, system, panel = make_db()
    asset = MonitoredAsset(
        system_id=system.id, panel_id=panel.id, asset_type="generator", asset_tag="GEN-1",
        slot="G1", connection_mode="plc", manufacturer="Kohler", rating_kw=500, status="pending",
    )
    db.add(asset)
    db.flush()

    sync_operational_device(db, asset)
    db.flush()

    device = db.get(Generator, asset.id)
    assert device is not None
    assert device.id == asset.id
    assert device.panel_id == panel.id
    assert device.name == "GEN-1"
    assert device.make == "Kohler"
    assert device.rated_kw == 500


def test_ats_commissioning_update_and_delete_stay_in_sync():
    db, system, panel = make_db()
    asset = MonitoredAsset(
        system_id=system.id, panel_id=panel.id, asset_type="ats", asset_tag="ATS-1",
        slot="A1", connection_mode="plc", branch="critical", rating_amps=400, status="pending",
    )
    db.add(asset)
    db.flush()
    sync_operational_device(db, asset)
    db.flush()

    asset.asset_tag = "ATS-RENAMED"
    asset.rating_amps = 600
    sync_operational_device(db, asset)
    db.flush()
    device = db.get(ATS, asset.id)
    assert device.name == "ATS-RENAMED"
    assert device.rated_amps == 600

    remove_operational_device(db, asset.id, "ats")
    db.flush()
    assert db.get(ATS, asset.id) is None
