from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.services.telemetry import telemetry_bridge
from app.routers import (
    alarms,
    ats,
    companies,
    generators,
    me,
    meters,
    oncall,
    one_lines,
    panels,
    reports,
    resellers,
    sites,
    systems,
    telemetry,
    users,
)

@asynccontextmanager
async def lifespan(_app: FastAPI):
    telemetry_bridge.start()
    yield
    telemetry_bridge.stop()


app = FastAPI(title="CPC API — Critical Power Command", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(resellers.router)
app.include_router(companies.router)
app.include_router(sites.router)
app.include_router(systems.router)
app.include_router(panels.router)
app.include_router(ats.router)
app.include_router(generators.router)
app.include_router(meters.router)
app.include_router(users.router)
app.include_router(alarms.router)
app.include_router(reports.router)
app.include_router(oncall.router)
app.include_router(me.router)
app.include_router(one_lines.router)
app.include_router(telemetry.router)


@app.get("/health")
def health():
    return {"status": "ok"}
