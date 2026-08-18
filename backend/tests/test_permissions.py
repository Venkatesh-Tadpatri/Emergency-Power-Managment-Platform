"""Unit tests for the PRD Section 6.3 permission matrix in app/auth/permissions.py.

Exercises the matrix directly against a throwaway in-memory SQLite DB (schema
compatible with the JSON/String columns used by the models) rather than going
through the HTTP layer, since scope resolution is pure data logic.
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.auth.permissions import can_view_company, can_view_site, can_view_system, can_write_system, get_scope
from app.models.site import Site
from app.models.base import Base
from app.models.company import Company
from app.models.reseller import Reseller
from app.models.system import System
from app.models.user import User, UserAssignedSystem


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = Session(engine)
    yield session
    session.close()


@pytest.fixture()
def fixtures(db):
    reseller_a = Reseller(name="Reseller A")
    reseller_b = Reseller(name="Reseller B")
    db.add_all([reseller_a, reseller_b])
    db.flush()

    company_a1 = Company(name="Company A1", reseller_id=reseller_a.id)
    company_b1 = Company(name="Company B1", reseller_id=reseller_b.id)
    db.add_all([company_a1, company_b1])
    db.flush()

    system_a1_1 = System(name="Sys A1-1", company_id=company_a1.id)
    system_a1_2 = System(name="Sys A1-2", company_id=company_a1.id)
    db.add_all([system_a1_1, system_a1_2])
    db.flush()
    db.commit()

    return {
        "reseller_a": reseller_a,
        "reseller_b": reseller_b,
        "company_a1": company_a1,
        "company_b1": company_b1,
        "system_a1_1": system_a1_1,
        "system_a1_2": system_a1_2,
    }


def test_superadmin_sees_everything(db, fixtures):
    user = User(zitadel_sub="sub-1", email="a@x.com", role="superadmin")
    assert can_view_company(
        user, db, fixtures["company_b1"].id, fixtures["company_b1"].reseller_id
    )
    assert can_view_system(user, db, fixtures["system_a1_1"])


def test_reseller_admin_scoped_to_own_reseller(db, fixtures):
    user = User(
        zitadel_sub="sub-2",
        email="b@x.com",
        role="reseller_admin",
        reseller_id=fixtures["reseller_a"].id,
    )
    assert can_view_company(
        user, db, fixtures["company_a1"].id, fixtures["company_a1"].reseller_id
    )
    assert not can_view_company(
        user, db, fixtures["company_b1"].id, fixtures["company_b1"].reseller_id
    )


def test_company_admin_cannot_see_other_companies(db, fixtures):
    user = User(
        zitadel_sub="sub-3",
        email="c@x.com",
        role="company_admin",
        company_id=fixtures["company_a1"].id,
    )
    assert can_view_system(user, db, fixtures["system_a1_1"])
    assert not can_view_company(
        user, db, fixtures["company_b1"].id, fixtures["company_b1"].reseller_id
    )


def test_only_superadmin_can_change_systems_or_devices(db, fixtures):
    company = fixtures["company_a1"]
    for role in ("reseller_admin", "company_admin", "system_operator"):
        user = User(
            zitadel_sub=f"write-{role}",
            email=f"{role}@x.com",
            role=role,
            reseller_id=company.reseller_id,
            company_id=company.id,
        )
        assert not can_write_system(user, db, company.id, company.reseller_id)

    superadmin = User(zitadel_sub="write-superadmin", email="superadmin@x.com", role="superadmin")
    assert can_write_system(superadmin, db, company.id, company.reseller_id)


def test_assigned_scope_operator_sees_only_assigned_systems(db, fixtures):
    user = User(
        zitadel_sub="sub-4",
        email="d@x.com",
        role="system_operator",
        scope_type="assigned",
        company_id=fixtures["company_a1"].id,
    )
    db.add(user)
    db.flush()
    db.add(UserAssignedSystem(user_id=user.id, system_id=fixtures["system_a1_1"].id))
    db.commit()

    assert can_view_system(user, db, fixtures["system_a1_1"])
    assert not can_view_system(user, db, fixtures["system_a1_2"])


def test_assigned_site_grants_all_its_systems_but_not_other_sites(db, fixtures):
    site_a = Site(name="Site A", customer_id=fixtures["company_a1"].id)
    site_b = Site(name="Site B", customer_id=fixtures["company_a1"].id)
    db.add_all([site_a, site_b])
    db.flush()
    fixtures["system_a1_1"].site_id = site_a.id
    fixtures["system_a1_2"].site_id = site_b.id
    user = User(zitadel_sub="sub-site", email="site@x.com", role="system_operator", scope_type="assigned", company_id=fixtures["company_a1"].id)
    db.add(user)
    db.flush()
    from app.models.user import UserAssignedSite
    db.add(UserAssignedSite(user_id=user.id, site_id=site_a.id))
    db.commit()
    assert can_view_site(user, db, site_a)
    assert can_view_system(user, db, fixtures["system_a1_1"])
    assert not can_view_site(user, db, site_b)
    assert not can_view_system(user, db, fixtures["system_a1_2"])


def test_unassigned_role_has_no_access(db, fixtures):
    user = User(zitadel_sub="sub-5", email="e@x.com", role=None)
    scope = get_scope(user, db)
    assert scope.assigned_system_ids == set()
    assert not can_view_system(user, db, fixtures["system_a1_1"])
