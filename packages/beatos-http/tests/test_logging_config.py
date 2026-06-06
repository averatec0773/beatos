"""Logging produces JSONL with request_id when configured."""
from __future__ import annotations

import json
import logging
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def _reset_logging_state():
    """configure() is sticky via a module-level _CONFIGURED flag, and importing
    beatos_http.__main__ configures logging at import time. Reset the flag + root
    handlers around each test so these assertions run from a clean slate
    regardless of what ran (or imported) earlier in the session."""
    from beatos_http import logging_config

    root = logging.getLogger()
    saved_handlers = root.handlers[:]
    saved_level = root.level
    logging_config._CONFIGURED = False
    root.handlers = []
    yield
    logging_config._CONFIGURED = False
    # Close handlers configure() opened during the test (RotatingFileHandler
    # holds an fd) before restoring the originals, to avoid ResourceWarning.
    for h in root.handlers:
        h.close()
    root.handlers = saved_handlers
    root.setLevel(saved_level)


def test_configure_writes_jsonl_to_path(tmp_path: Path, monkeypatch):
    from beatos_http import logging_config

    log_file = tmp_path / "sidecar.jsonl"
    monkeypatch.setenv("BEATOS_LOG_PATH", str(log_file))
    logging_config.configure()

    logger = logging.getLogger("beatos_http.test")
    logger.info("hello_event", extra={"foo": "bar"})

    # Flush handlers
    for h in logging.getLogger().handlers:
        h.flush()

    assert log_file.exists()
    lines = log_file.read_text().strip().splitlines()
    assert len(lines) >= 1
    entry = json.loads(lines[-1])
    assert entry["event"] == "hello_event" or "hello_event" in entry.get("message", "")
    assert entry["level"] == "info"


def test_configure_is_idempotent(tmp_path: Path, monkeypatch):
    from beatos_http import logging_config

    monkeypatch.setenv("BEATOS_LOG_PATH", str(tmp_path / "log.jsonl"))
    logging_config.configure()
    logging_config.configure()  # second call must not blow up
