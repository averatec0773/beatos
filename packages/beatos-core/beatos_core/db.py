"""SQLite migration runner.

Reads `migrations/*.sql` lexically and applies any version not yet recorded
in the `schema_version` table. Migrations are append-only — never edit an
applied file; create the next-numbered one instead.
"""
from __future__ import annotations

import datetime as _dt
import os
import pathlib
import re
from pathlib import Path

import aiosqlite

_MIGRATIONS_DIR = pathlib.Path(__file__).parent / "migrations"
_VERSION_RE = re.compile(r"^(\d{3})_.*\.sql$")


def _discover_migrations() -> list[tuple[int, pathlib.Path]]:
    """Return [(version, path), ...] sorted by version."""
    out: list[tuple[int, pathlib.Path]] = []
    for p in sorted(_MIGRATIONS_DIR.iterdir()):
        m = _VERSION_RE.match(p.name)
        if m:
            out.append((int(m.group(1)), p))
    return out


async def _table_exists(conn: aiosqlite.Connection, name: str) -> bool:
    async with conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ) as cur:
        return await cur.fetchone() is not None


async def _ensure_schema_version_table(conn: aiosqlite.Connection) -> None:
    await conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version ("
        "version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)"
    )
    await conn.commit()


async def _applied_versions(conn: aiosqlite.Connection) -> set[int]:
    async with conn.execute("SELECT version FROM schema_version") as cur:
        rows = await cur.fetchall()
    return {r[0] for r in rows}


async def run_migrations(db_path: pathlib.Path | str) -> None:
    """Apply every migration not yet recorded in `schema_version`.

    Safe to call repeatedly: already-applied migrations are skipped.
    """
    db_path = pathlib.Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    async with aiosqlite.connect(db_path) as conn:
        await _ensure_schema_version_table(conn)
        applied = await _applied_versions(conn)

        for version, path in _discover_migrations():
            if version in applied:
                continue
            sql = path.read_text(encoding="utf-8")
            # executescript issues an implicit COMMIT before running; wrap DDL
            # that may conflict with bootstrap tables by filtering them out.
            # schema_version is managed by the runner, not by migration files.
            filtered = _strip_schema_version_ddl(sql)
            await conn.executescript(filtered)
            await conn.execute(
                "INSERT INTO schema_version (version, applied_at) VALUES (?, ?)",
                (version, _dt.datetime.now(_dt.timezone.utc).isoformat()),
            )
            await conn.commit()


def resolve_db_path() -> Path:
    """Resolve the global db path. Honors BEATOS_DB_PATH env var, otherwise defaults
    to ~/Music/BeatOS/global.db (cross-platform — pathlib.Path.home() handles it)."""
    override = os.environ.get("BEATOS_DB_PATH")
    if override:
        return Path(override)
    return Path.home() / "Music" / "BeatOS" / "global.db"


def _strip_schema_version_ddl(sql: str) -> str:
    """Remove the CREATE TABLE schema_version statement from a SQL script.

    The runner owns schema_version creation; migration files should not
    duplicate it. This makes migration files self-documenting while keeping
    the runner authoritative.
    """
    # Match CREATE TABLE schema_version ... ; (multi-line, non-greedy).
    pattern = re.compile(
        r"CREATE\s+TABLE\s+schema_version\s*\([^;]+\)\s*;",
        re.IGNORECASE | re.DOTALL,
    )
    return pattern.sub("", sql)
