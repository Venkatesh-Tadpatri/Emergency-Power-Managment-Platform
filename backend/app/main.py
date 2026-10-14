from contextlib import asynccontextmanager
import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings
from app.logging_config import configure_logging
from app.services.telemetry import telemetry_bridge
from app.routers import (
    alarms,
    ats,
    companies,
    generators,
    me,
    meters,
    monitored_assets,
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

log_dir = configure_logging()
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("Application starting; logs=%s", log_dir)
    try:
        telemetry_bridge.start()
        yield
    except Exception:
        logger.exception("Application lifespan failed")
        raise
    finally:
        telemetry_bridge.stop()
        logger.info("Application stopped")


app = FastAPI(title="CPC API — Critical Power Command", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logging(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        logger.exception(
            "Unhandled request error request_id=%s method=%s path=%s client=%s",
            request_id,
            request.method,
            request.url.path,
            request.client.host if request.client else "unknown",
        )
        raise
    duration_ms = (time.perf_counter() - started) * 1000
    response.headers["X-Request-ID"] = request_id
    log = logger.warning if response.status_code >= 400 else logger.info
    log(
        "HTTP request_id=%s method=%s path=%s status=%d duration_ms=%.2f",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    logger.warning("HTTP error method=%s path=%s status=%d detail=%s", request.method, request.url.path, exc.status_code, exc.detail)
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning("Validation error method=%s path=%s errors=%s", request.method, request.url.path, exc.errors())
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled API exception method=%s path=%s", request.method, request.url.path, exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


class ClientError(BaseModel):
    message: str = Field(max_length=2000)
    source: str = Field(default="browser", max_length=100)
    stack: str | None = Field(default=None, max_length=10000)
    url: str | None = Field(default=None, max_length=2000)
    user_agent: str | None = Field(default=None, max_length=1000)


@app.post("/client-errors", status_code=204)
def record_client_error(error: ClientError):
    logger.error(
        "Client error source=%s url=%s message=%s user_agent=%s\nstack=%s",
        error.source,
        error.url,
        error.message,
        error.user_agent,
        error.stack or "not provided",
    )

app.include_router(resellers.router)
app.include_router(companies.router)
app.include_router(sites.router)
app.include_router(systems.router)
app.include_router(panels.router)
app.include_router(ats.router)
app.include_router(generators.router)
app.include_router(meters.router)
app.include_router(monitored_assets.router)
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
