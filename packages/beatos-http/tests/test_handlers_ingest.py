"""Approve handlers for create_tracks + attach_assets + detach_assets."""
import datetime as dt

import aiosqlite
import pytest
from httpx import ASGITransport, AsyncClient

from beatos_core.db import run_migrations
from beatos_core.two_phase import create_token
from beatos_http.app import create_app


@pytest.fixture
async def db_path(tmp_path, monkeypatch):
    p = tmp_path / "t.db"
    await run_migrations(p)
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(p) as conn:
        await conn.execute(
            "INSERT INTO track (id, title, created_at, updated_at) VALUES (1, 'Existing', ?, ?)",
            (now, now),
        )
        await conn.execute(
            "INSERT INTO track (id, title, created_at, updated_at) VALUES (2, 'Second', ?, ?)",
            (now, now),
        )
        await conn.commit()
    return p


@pytest.fixture
async def client(db_path):
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        async with app.router.lifespan_context(app):
            yield c


# --- create_tracks ---


@pytest.mark.asyncio
async def test_approve_create_tracks_inserts_rows(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        tok = await create_token(
            conn,
            "create_tracks",
            {
                "items": [
                    {"title": "Beat A", "bpm": 140, "producer": ["X"]},
                    {"title": "Beat B"},
                ],
                "preview": {"headline": "Create 2", "sample": [], "warnings": []},
            },
        )
    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 200
    body = res.json()
    assert len(body["created_ids"]) == 2
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT title, bpm, producer FROM track WHERE id IN ({}) ORDER BY id".format(
                ",".join(str(i) for i in body["created_ids"])
            )
        ) as cur:
            rows = await cur.fetchall()
    titles = [r[0] for r in rows]
    assert "Beat A" in titles and "Beat B" in titles


# --- attach_assets ---


@pytest.mark.asyncio
async def test_approve_attach_assets_inserts_multiple(client, db_path, tmp_path):
    a1 = tmp_path / "a1.wav"
    a1.write_bytes(b"x" * 100)
    c1 = tmp_path / "c1.jpg"
    c1.write_bytes(b"y" * 50)
    async with aiosqlite.connect(db_path) as conn:
        tok = await create_token(
            conn,
            "attach_assets",
            {
                "items": [
                    {"track_id": 1, "role": "audio", "path": str(a1)},
                    {"track_id": 1, "role": "cover", "path": str(c1)},
                    {"track_id": 2, "role": "audio", "path": str(a1)},
                ],
                "preview": {"headline": "x", "sample": [], "warnings": []},
            },
        )
    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 200
    body = res.json()
    assert len(body["results"]) == 3
    for r in body["results"]:
        assert r["replaced"] is False
        assert isinstance(r["asset_id"], int)
    # DB carries size_bytes + mime
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT size_bytes, mime FROM asset") as cur:
            rows = await cur.fetchall()
    assert all(row[0] > 0 for row in rows)
    assert all(row[1] is not None for row in rows)


@pytest.mark.asyncio
async def test_approve_attach_assets_replaces_existing(client, db_path, tmp_path):
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    new = tmp_path / "n.wav"
    new.write_bytes(b"x")
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            "INSERT INTO asset (track_id, role, abs_path, created_at, updated_at) "
            "VALUES (1, 'audio', '/old.wav', ?, ?)",
            (now, now),
        )
        tok = await create_token(
            conn,
            "attach_assets",
            {
                "items": [
                    {"track_id": 1, "role": "audio", "path": str(new)},
                ],
                "preview": {"headline": "x", "sample": [], "warnings": []},
            },
        )
        await conn.commit()
    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 200
    assert res.json()["results"][0]["replaced"] is True
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT abs_path FROM asset WHERE track_id=1 AND role='audio'"
        ) as cur:
            assert (await cur.fetchone())[0] == str(new)


@pytest.mark.asyncio
async def test_approve_attach_assets_vanished_track_rolls_back(
    client, db_path, tmp_path
):
    """Track deleted mid-TTL → FK violation on INSERT → RowVanishedError → 409
    + full rollback. PRAGMA foreign_keys=ON (enabled on the approve connection)
    is what makes this fire — otherwise CASCADE clauses are silent no-ops and
    orphan asset rows would be the silent failure mode."""
    f = tmp_path / "a.wav"
    f.write_bytes(b"x")
    async with aiosqlite.connect(db_path) as conn:
        tok = await create_token(
            conn,
            "attach_assets",
            {
                "items": [
                    {"track_id": 1, "role": "audio", "path": str(f)},
                    {"track_id": 2, "role": "audio", "path": str(f)},
                ],
                "preview": {"headline": "x", "sample": [], "warnings": []},
            },
        )
        # Vanish track 2 mid-TTL.
        await conn.execute("DELETE FROM track WHERE id=2")
        await conn.commit()
    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 409
    # Track 1's insert must NOT have persisted — atomic rollback.
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT COUNT(*) FROM asset") as cur:
            assert (await cur.fetchone())[0] == 0


@pytest.mark.asyncio
async def test_approve_attach_assets_missing_file_aborts_batch(
    client, db_path, tmp_path
):
    """If any file vanished between token-issue and approve, the entire batch
    must roll back — not partial write."""
    good = tmp_path / "good.wav"
    good.write_bytes(b"x")
    bad = tmp_path / "bad.wav"
    bad.write_bytes(b"x")
    async with aiosqlite.connect(db_path) as conn:
        tok = await create_token(
            conn,
            "attach_assets",
            {
                "items": [
                    {"track_id": 1, "role": "audio", "path": str(good)},
                    {"track_id": 2, "role": "audio", "path": str(bad)},
                ],
                "preview": {"headline": "x", "sample": [], "warnings": []},
            },
        )
    bad.unlink()  # simulate disappearance after token issuance
    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 409
    # No asset row should have been written
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT COUNT(*) FROM asset") as cur:
            assert (await cur.fetchone())[0] == 0


# --- detach_assets ---


@pytest.mark.asyncio
async def test_approve_detach_assets_removes_rows(client, db_path):
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            "INSERT INTO asset (track_id, role, abs_path, created_at, updated_at) "
            "VALUES (1, 'audio', '/a.wav', ?, ?)",
            (now, now),
        )
        await conn.execute(
            "INSERT INTO asset (track_id, role, abs_path, created_at, updated_at) "
            "VALUES (1, 'cover', '/c.jpg', ?, ?)",
            (now, now),
        )
        tok = await create_token(
            conn,
            "detach_assets",
            {
                "items": [
                    {"track_id": 1, "role": "audio"},
                    {"track_id": 1, "role": "cover"},
                ],
                "preview": {"headline": "x", "sample": [], "warnings": []},
            },
        )
        await conn.commit()
    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 200
    body = res.json()
    assert all(r["removed"] is True for r in body["results"])
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT COUNT(*) FROM asset") as cur:
            assert (await cur.fetchone())[0] == 0


@pytest.mark.asyncio
async def test_approve_detach_assets_idempotent_on_missing(client, db_path):
    """Items pointing to already-absent assets do NOT fail the batch; they
    are reported with removed=False alongside successful removals."""
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            "INSERT INTO asset (track_id, role, abs_path, created_at, updated_at) "
            "VALUES (1, 'audio', '/a.wav', ?, ?)",
            (now, now),
        )
        tok = await create_token(
            conn,
            "detach_assets",
            {
                "items": [
                    {"track_id": 1, "role": "audio"},
                    {"track_id": 1, "role": "cover"},  # never existed
                ],
                "preview": {"headline": "x", "sample": [], "warnings": []},
            },
        )
        await conn.commit()
    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 200
    body = res.json()
    by_role = {r["role"]: r["removed"] for r in body["results"]}
    assert by_role == {"audio": True, "cover": False}


# --- create_tracks applies creation defaults (parity with the UI path) ---


async def _set_setting(db_path, key, value):
    import json as _json
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            "INSERT INTO app_setting (key, value_json, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
            (key, _json.dumps(value), now),
        )
        await conn.commit()


@pytest.mark.asyncio
async def test_create_tracks_applies_default_license_and_free(client, db_path):
    await _set_setting(db_path, "default_is_free", True)
    await _set_setting(db_path, "default_license_tiers", [
        {"name": "MP3", "deliverables": ["mp3"], "prices": {"CNY": 128}, "share": 25},
        {"name": "WAV", "deliverables": ["wav"], "prices": {"CNY": 188}, "share": 15},
    ])
    async with aiosqlite.connect(db_path) as conn:
        tok = await create_token(
            conn, "create_tracks",
            {"items": [{"title": "Defaulted"}],
             "preview": {"headline": "x", "sample": [], "warnings": []}},
        )
    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 200
    tid = res.json()["created_ids"][0]
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT is_free FROM track WHERE id = ?", (tid,)) as c:
            assert (await c.fetchone())[0] == 1
        async with conn.execute(
            "SELECT name, deliverables, prices_json, share FROM license_tier "
            "WHERE track_id = ? ORDER BY position", (tid,)
        ) as c:
            rows = await c.fetchall()
    assert [r[0] for r in rows] == ["MP3", "WAV"]
    assert rows[0][1] == '["mp3"]' and '"CNY": 128' in rows[0][2] and rows[0][3] == 25


@pytest.mark.asyncio
async def test_create_tracks_no_defaults_no_tiers(client, db_path):
    # No default_* settings configured → behaves as before (bare track row).
    async with aiosqlite.connect(db_path) as conn:
        tok = await create_token(
            conn, "create_tracks",
            {"items": [{"title": "Bare"}],
             "preview": {"headline": "x", "sample": [], "warnings": []}},
        )
    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 200
    tid = res.json()["created_ids"][0]
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT is_free FROM track WHERE id = ?", (tid,)) as c:
            assert (await c.fetchone())[0] == 0
        async with conn.execute(
            "SELECT COUNT(*) FROM license_tier WHERE track_id = ?", (tid,)
        ) as c:
            assert (await c.fetchone())[0] == 0
