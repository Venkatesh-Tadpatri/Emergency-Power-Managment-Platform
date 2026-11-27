from app.crud import company as company_crud
from app.models.company import Company
from app.routers.panels import _next_panel_number
from app.schemas.company import CompanyCreate, CompanyRead, CompanyUpdate
from tests.test_operational_device_sync import make_db


def test_new_customers_get_unique_codes_from_their_name():
    db, system, _panel = make_db()
    reseller_id = system.company.reseller_id
    first = company_crud.create_company(db, CompanyCreate(name="Abb Customer", reseller_id=reseller_id))
    second = company_crud.create_company(db, CompanyCreate(name="Abb C2", reseller_id=reseller_id))
    third = company_crud.create_company(db, CompanyCreate(name="Abb C3", reseller_id=reseller_id))
    assert [first.customer_code, second.customer_code, third.customer_code] == ["ABBC", "ABBC2", "ABBC3"]


def test_rename_keeps_custcode_and_pnumber_prefix():
    db, system, _panel = make_db()
    company = company_crud.create_company(db, CompanyCreate(name="Aster Prime", reseller_id=system.company.reseller_id))
    company_crud.update_company(db, company, CompanyUpdate(name="Zenith Hospitals"))
    assert company.customer_code == "ASTE"
    assert _next_panel_number(db, company.id).startswith("ASTEP")


def test_custcode_cannot_be_set_through_update_and_is_returned():
    assert "customer_code" not in CompanyUpdate.model_fields
    assert "customer_code" in CompanyRead.model_fields


def test_rows_from_before_the_column_get_a_code_on_first_panel():
    db, system, _panel = make_db()  # make_db's customer has no stored code
    company = db.get(Company, system.company_id)
    assert company.customer_code is None
    number = _next_panel_number(db, company.id)
    assert company.customer_code and number.startswith(f"{company.customer_code}P")


def test_notes_round_trip():
    db, system, _panel = make_db()
    company = company_crud.create_company(db, CompanyCreate(name="Medistar Hospital", reseller_id=system.company.reseller_id, notes="Gate code 4411"))
    company_crud.update_company(db, company, CompanyUpdate(notes="Escalate to facilities first"))
    assert CompanyRead.model_validate(company).notes == "Escalate to facilities first"
