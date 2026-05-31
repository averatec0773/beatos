import datetime as dt

import aiosqlite
import pytest

from beatos_core.db import run_migrations


@pytest.mark.asyncio
async def test_share_column_exists_and_defaults_null(tmp_path):
    p = tmp_path / "t.db"
    await run_migrations(p)
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(p) as conn:
        await conn.execute(
            "INSERT INTO track (id, title, created_at, updated_at) VALUES (1,'A',?,?)",
            (now, now),
        )
        await conn.execute(
            "INSERT INTO license_tier (track_id, position, name, deliverables, prices_json, created_at, updated_at) "
            "VALUES (1, 0, 'MP3', '[\"mp3\"]', '{}', ?, ?)",
            (now, now),
        )
        await conn.commit()
        async with conn.execute("SELECT share FROM license_tier WHERE track_id=1") as cur:
            row = await cur.fetchone()
        assert row[0] is None
        await conn.execute("UPDATE license_tier SET share = 25.0 WHERE track_id=1")
        async with conn.execute("SELECT share FROM license_tier WHERE track_id=1") as cur:
            assert (await cur.fetchone())[0] == 25.0
