"""Shared fixtures for beatos-core tests."""
from __future__ import annotations

import pathlib

import pytest_asyncio
from beatos_core.db import run_migrations


@pytest_asyncio.fixture
async def fresh_db(tmp_path: pathlib.Path, monkeypatch):
    """Provision a fresh migrated DB and point BEATOS_DB_PATH at it."""
    db = tmp_path / "beatos.db"
    await run_migrations(db)
    monkeypatch.setenv("BEATOS_DB_PATH", str(db))
    yield db
