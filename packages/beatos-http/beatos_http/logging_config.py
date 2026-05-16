"""Structured logging configuration.

Configures stdlib logging + structlog with a JSON file sink and a pretty
console sink. The file sink is what the AI dev loop tails — every log line
is one JSON object with `ts`, `level`, `event`, `request_id` (when in a
request scope), and any bound context.

Idempotent: calling configure() twice is a no-op after the first call.
"""
from __future__ import annotations

import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any

import structlog

_CONFIGURED = False


def _default_log_path() -> Path:
    env = os.environ.get("BEATOS_LOG_PATH")
    if env:
        return Path(env)
    # Repo-relative dev default; falls back to /tmp if cwd is unwritable.
    cwd_logs = Path.cwd() / "logs"
    try:
        cwd_logs.mkdir(parents=True, exist_ok=True)
        return cwd_logs / "sidecar.jsonl"
    except OSError:
        return Path("/tmp/beatos_sidecar.jsonl")


def configure() -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return

    log_path = _default_log_path()
    log_path.parent.mkdir(parents=True, exist_ok=True)

    shared_processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True, key="ts"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    structlog.configure(
        processors=shared_processors
        + [structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    json_fmt = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.processors.JSONRenderer(),
        ],
    )
    console_fmt = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.dev.ConsoleRenderer(colors=sys.stdout.isatty()),
        ],
    )

    file_handler = RotatingFileHandler(
        log_path,
        maxBytes=10 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    file_handler.setFormatter(json_fmt)

    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(console_fmt)

    root = logging.getLogger()
    # Replace existing handlers to keep idempotency clean.
    root.handlers = [file_handler, stream_handler]
    root.setLevel(logging.INFO)

    # uvicorn's loggers should propagate to root (default: they do).
    for name in ("uvicorn", "uvicorn.access", "uvicorn.error"):
        logging.getLogger(name).propagate = True
        logging.getLogger(name).handlers = []

    _CONFIGURED = True
