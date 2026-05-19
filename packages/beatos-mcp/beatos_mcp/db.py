"""Read-only SQLite connection helper for the MCP server.

Reads BEATOS_DB_PATH (required — no implicit default in MCP), opens the DB,
sets PRAGMA query_only=1 as defense-in-depth (v0.0.20 has no write tools but
the skeleton is already in place; this prevents accidental future regressions).
"""
from __future__ import annotations

import contextlib
import os
import pathlib

import aiosqlite


class DBNotConfigured(RuntimeError):
    """BEATOS_DB_PATH is missing, or points at a file that does not exist."""


def _resolve_db_path() -> pathlib.Path:
    raw = os.environ.get("BEATOS_DB_PATH")
    if not raw:
        raise DBNotConfigured(
            "BEATOS_DB_PATH env var is not set. "
            "Set it to the absolute path of your beatos.db file "
            "(visible in BeatOS Settings → AI Integration)."
        )
    path = pathlib.Path(raw).expanduser()
    if not path.is_file():
        raise DBNotConfigured(
            f"Database not found at {path}. "
            "Open the BeatOS app at least once so it can create the database."
        )
    return path


@contextlib.asynccontextmanager
async def connect():
    """Yield a read-only aiosqlite connection. Reads BEATOS_DB_PATH at every
    call so tests can monkeypatch the env var per-test."""
    db_path = _resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute("PRAGMA query_only=1")
        yield conn


@contextlib.asynccontextmanager
async def connect_writable():
    """Yield a writable aiosqlite connection. Used by MCP write tools only;
    read tools must stay on connect() which sets query_only=1 as
    defense-in-depth."""
    db_path = _resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        # Intentionally NO query_only here.
        yield conn
