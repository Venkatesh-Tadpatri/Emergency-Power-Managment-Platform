"""Central logging configuration for console and durable daily log files."""

from __future__ import annotations

import logging
import logging.config
from pathlib import Path

from app.config import settings


def configure_logging() -> Path:
    """Configure all application/Uvicorn loggers and return the active log folder."""
    log_dir = Path(settings.log_dir).expanduser().resolve()
    log_dir.mkdir(parents=True, exist_ok=True)

    formatter = {
        "format": (
            "%(asctime)s | %(levelname)s | %(name)s | "
            "process=%(process)d thread=%(threadName)s | %(message)s"
        ),
        "datefmt": "%Y-%m-%dT%H:%M:%S%z",
    }
    handlers: dict[str, dict] = {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "standard",
            "level": settings.log_level.upper(),
            "stream": "ext://sys.stdout",
        },
        "application_file": {
            "class": "logging.handlers.TimedRotatingFileHandler",
            "formatter": "standard",
            "level": settings.log_level.upper(),
            "filename": str(log_dir / "application.log"),
            "when": "midnight",
            "interval": 1,
            "backupCount": settings.log_retention_days,
            "encoding": "utf-8",
            "utc": False,
        },
        "error_file": {
            "class": "logging.handlers.TimedRotatingFileHandler",
            "formatter": "standard",
            "level": "ERROR",
            "filename": str(log_dir / "errors.log"),
            "when": "midnight",
            "interval": 1,
            "backupCount": settings.log_retention_days,
            "encoding": "utf-8",
            "utc": False,
        },
    }
    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {"standard": formatter},
            "handlers": handlers,
            "root": {
                "level": settings.log_level.upper(),
                "handlers": ["console", "application_file", "error_file"],
            },
            "loggers": {
                "uvicorn": {"level": settings.log_level.upper(), "propagate": True, "handlers": []},
                "uvicorn.error": {"level": settings.log_level.upper(), "propagate": True, "handlers": []},
                "uvicorn.access": {"level": settings.log_level.upper(), "propagate": True, "handlers": []},
            },
        }
    )
    return log_dir
