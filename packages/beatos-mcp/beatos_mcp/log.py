"""structlog setup for beatos-mcp.

stdout is reserved for JSON-RPC protocol — NEVER write there. All logs go
to a JSONL file under the user's standard log directory, and also to stderr
for live debugging (Claude Desktop captures child stderr in its own logs).
"""
from __future__ import annotations

import logging
import os
import pathlib
import sys

import structlog


def _default_log_dir() -> pathlib.Path:
    if sys.platform == "darwin":
        return pathlib.Path.home() / "Library" / "Logs" / "beatos"
    if sys.platform.startswith("win"):
        base = os.environ.get("APPDATA") or str(pathlib.Path.home())
        return pathlib.Path(base) / "beatos" / "logs"
    # Linux / dev
    return pathlib.Path.home() / ".local" / "state" / "beatos"


_configured = False


def configure() -> structlog.stdlib.BoundLogger:
    """Idempotently configure structlog and return a bound logger."""
    global _configured

    log_dir = _default_log_dir()
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "mcp.jsonl"

    if not _configured:
        file_handler = logging.FileHandler(log_file, encoding="utf-8")
        stderr_handler = logging.StreamHandler(sys.stderr)

        root = logging.getLogger()
        root.addHandler(file_handler)
        root.addHandler(stderr_handler)
        root.setLevel(logging.INFO)

        structlog.configure(
            processors=[
                structlog.processors.add_log_level,
                structlog.processors.TimeStamper(fmt="iso"),
                structlog.processors.JSONRenderer(),
            ],
            wrapper_class=structlog.stdlib.BoundLogger,
            logger_factory=structlog.stdlib.LoggerFactory(),
            cache_logger_on_first_use=True,
        )
        _configured = True

    return structlog.get_logger("beatos_mcp")
