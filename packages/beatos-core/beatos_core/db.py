"""SQLite migration runner.

Reads `migrations/*.sql` lexically and applies any version not yet recorded
in the `schema_version` table. Migrations are append-only — never edit an
applied file; create the next-numbered one instead.
"""
from __future__ import annotations

import contextlib
import datetime as _dt
import os
import pathlib
import re
import shutil
import sqlite3
import sys
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


_TXN_CONTROL = frozenset(
    {"BEGIN", "BEGIN TRANSACTION", "COMMIT", "COMMIT TRANSACTION", "END", "END TRANSACTION"}
)


def _stmt_core(stmt: str) -> str:
    """The statement minus `--` comment lines, normalized for classification.

    A chunk like "-- rebuild note\nBEGIN;" must classify as BEGIN, or the
    txn-control filter misses it and the runner's transaction nests.
    """
    lines = [ln for ln in stmt.splitlines() if ln.strip() and not ln.strip().startswith("--")]
    return "\n".join(lines).strip().rstrip(";").strip().upper()


def _split_statements(sql: str) -> list[str]:
    """Split a migration script into individual statements.

    `sqlite3.complete_statement` does the lexing, so semicolons inside string
    literals (and trigger bodies, should one ever appear) don't split. Standalone
    transaction-control statements are dropped — the runner provides the
    transaction, and a nested BEGIN from a file that carries its own pair
    (021 does) would error. Comment-only chunks are dropped too.
    """
    statements: list[str] = []
    buf = ""
    for line in sql.splitlines(keepends=True):
        buf += line
        if sqlite3.complete_statement(buf):
            statements.append(buf.strip())
            buf = ""
    tail = buf.strip()
    # A trailing fragment with no ';' can be a final unterminated statement.
    if tail:
        statements.append(tail)
    return [s for s in statements if _stmt_core(s) and _stmt_core(s) not in _TXN_CONTROL]


async def run_migrations(db_path: pathlib.Path | str) -> None:
    """Apply every migration not yet recorded in `schema_version`.

    Safe to call repeatedly: already-applied migrations are skipped. Each
    migration is applied ATOMICALLY together with its `schema_version` row —
    a mid-file failure (disk full, crash, bad statement) rolls the whole file
    back, so a re-run starts from a clean slate instead of hitting
    "table already exists" on a half-applied schema.
    """
    db_path = pathlib.Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    # isolation_level=None → true autocommit; the runner controls transactions
    # explicitly (Python's implicit-BEGIN mode would fight the explicit BEGIN).
    async with aiosqlite.connect(db_path, isolation_level=None) as conn:
        # WAL persists at file level; must run before any transaction opens.
        await conn.execute("PRAGMA journal_mode=WAL")
        await _ensure_schema_version_table(conn)
        applied = await _applied_versions(conn)

        for version, path in _discover_migrations():
            if version in applied:
                continue
            sql = path.read_text(encoding="utf-8")
            # schema_version is managed by the runner, not by migration files.
            filtered = _strip_schema_version_ddl(sql)
            statements = _split_statements(filtered)
            # IMMEDIATE takes the write lock up front, so a concurrent second
            # process (pre-single-instance-lock builds) blocks here instead of
            # failing halfway through.
            await conn.execute("BEGIN IMMEDIATE")
            try:
                for stmt in statements:
                    await conn.execute(stmt)
                await conn.execute(
                    "INSERT INTO schema_version (version, applied_at) VALUES (?, ?)",
                    (version, _dt.datetime.now(_dt.timezone.utc).isoformat()),
                )
            except BaseException:
                with contextlib.suppress(Exception):
                    await conn.execute("ROLLBACK")
                raise
            await conn.execute("COMMIT")


def _default_data_dir() -> Path:
    """Per-OS app-data dir backing the DEFAULT db location (v0.0.50+ — keeps
    SQLite off cloud-synced folders like ~/Music). Mirrors the dev-Electron
    userData dir (app name "beatos-desktop") and the platform branches in
    beatos_http.handshake.default_handshake_path — keep the three in sync.
    Packaged desktop builds always pass BEATOS_DB_PATH explicitly, so this
    default only governs web/standalone mode."""
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "beatos-desktop"
    if sys.platform.startswith("win"):
        return Path(os.environ.get("APPDATA", str(Path.home()))) / "beatos-desktop"
    xdg = os.environ.get("XDG_CONFIG_HOME")
    return (Path(xdg) if xdg else Path.home() / ".config") / "beatos-desktop"


def legacy_db_path() -> Path:
    """The pre-v0.0.50 default (~/Music/BeatOS/global.db). Referenced only by
    the one-time migration below; the desktop equivalent lives in
    apps/desktop/src/main/db-migrate.ts."""
    return Path.home() / "Music" / "BeatOS" / "global.db"


def resolve_db_path() -> Path:
    """Resolve the global db path. Honors the BEATOS_DB_PATH env var, otherwise
    defaults to <per-OS app-data dir>/global.db — the same library the desktop
    app uses, so web mode and desktop see one catalog."""
    override = os.environ.get("BEATOS_DB_PATH")
    if override:
        return Path(override)
    return _default_data_dir() / "global.db"


def migrate_legacy_db_if_needed() -> bool:
    """One-time copy of a pre-v0.0.50 library into the new default location.

    Runs only when the DEFAULT path is in play (no BEATOS_DB_PATH override),
    the new location has no DB yet, and a legacy DB exists. COPY, never move —
    the legacy file stays untouched as a backup. The -wal/-shm sidecars are
    copied too so an un-checkpointed write-ahead log isn't lost (mirrors
    apps/desktop/src/main/db-migrate.ts). Returns True when a copy happened."""
    if os.environ.get("BEATOS_DB_PATH"):
        return False
    target = resolve_db_path()
    legacy = legacy_db_path()
    if target.exists() or not legacy.exists():
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    for suffix in ("", "-wal", "-shm"):
        src = Path(str(legacy) + suffix)
        if src.exists():
            shutil.copyfile(src, str(target) + suffix)
    return True


@contextlib.asynccontextmanager
async def connect_writable():
    """Yield a writable aiosqlite connection with FK enforcement ON.

    SQLite ships FK enforcement off per-connection, which silently neutralises
    every ON DELETE CASCADE (rule 9). Set it here so all write paths through this
    helper respect cascades. Path resolves at call time via resolve_db_path()."""
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute("PRAGMA foreign_keys=ON")
        yield conn


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
