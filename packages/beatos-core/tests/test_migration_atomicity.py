"""Migration runner atomicity — a mid-file failure must roll back the whole
migration (including its schema_version row) so a re-run starts clean.

Guards audit finding B1 (2026-07-16): the old executescript-based runner
autocommitted mid-file, so one transient failure left a half-applied schema
that could never re-run ("table already exists")."""
import aiosqlite
import pytest

import beatos_core.db as db_mod
from beatos_core.db import _split_statements, run_migrations


async def _table_exists(path, name: str) -> bool:
    async with aiosqlite.connect(path) as conn:
        async with conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
        ) as cur:
            return await cur.fetchone() is not None


async def _version_applied(path, version: int) -> bool:
    async with aiosqlite.connect(path) as conn:
        async with conn.execute(
            "SELECT 1 FROM schema_version WHERE version=?", (version,)
        ) as cur:
            return await cur.fetchone() is not None


@pytest.mark.asyncio
async def test_failed_migration_rolls_back_completely(tmp_path, monkeypatch):
    db_path = tmp_path / "t.db"
    await run_migrations(db_path)  # real 001-023 apply cleanly

    bad = tmp_path / "999_atomic_probe.sql"
    bad.write_text(
        "CREATE TABLE atomic_probe (id INTEGER PRIMARY KEY);\n"
        "INSERT INTO no_such_table VALUES (1);\n",
        encoding="utf-8",
    )
    real_discover = db_mod._discover_migrations
    monkeypatch.setattr(
        db_mod, "_discover_migrations", lambda: real_discover() + [(999, bad)]
    )

    with pytest.raises(Exception, match="no_such_table"):
        await run_migrations(db_path)

    # The failing file's earlier statement must NOT have been committed, and
    # the version must not be recorded — the DB is exactly as before the file.
    assert not await _table_exists(db_path, "atomic_probe")
    assert not await _version_applied(db_path, 999)

    # A corrected re-run succeeds from a clean slate.
    bad.write_text("CREATE TABLE atomic_probe (id INTEGER PRIMARY KEY);\n", encoding="utf-8")
    await run_migrations(db_path)
    assert await _table_exists(db_path, "atomic_probe")
    assert await _version_applied(db_path, 999)


@pytest.mark.asyncio
async def test_migration_021_own_txn_control_is_absorbed(tmp_path):
    # 021 carries its own BEGIN;/COMMIT; — the runner must absorb them into
    # its transaction (a nested BEGIN would error) while every real statement
    # still lands. Fresh-DB apply of all real migrations covers it end-to-end.
    db_path = tmp_path / "t.db"
    await run_migrations(db_path)
    assert await _table_exists(db_path, "asset")  # 021 rebuilt this table
    assert await _version_applied(db_path, 21)


def test_split_statements_lexing():
    sql = (
        "-- header comment\n"
        "BEGIN;\n"
        "CREATE TABLE a (x TEXT);\n"
        "INSERT INTO a VALUES ('semi;colon ''quoted'' value');\n"
        "COMMIT;\n"
        "-- trailing comment\n"
    )
    stmts = _split_statements(sql)
    # BEGIN/COMMIT dropped (even behind a leading comment, as in 021),
    # comment-only tail dropped, semicolon inside the string literal intact.
    assert len(stmts) == 2
    assert "CREATE TABLE a" in stmts[0]
    assert "semi;colon" in stmts[1]


def test_split_statements_keeps_unterminated_tail():
    stmts = _split_statements("CREATE TABLE b (y TEXT);\nINSERT INTO b VALUES ('z')")
    assert len(stmts) == 2
    assert stmts[1].endswith("('z')")
