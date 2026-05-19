"""create_tracks + attach_asset MCP tools."""
import datetime as dt
import json
import os

import aiosqlite
import pytest

from beatos_core.db import run_migrations
from beatos_mcp.tools.ingest import attach_asset, create_tracks


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
        await conn.commit()
    return p


async def _payload(db_path, token):
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT payload FROM tokens WHERE token=?", (token,)
        ) as cur:
            return json.loads((await cur.fetchone())[0])


@pytest.mark.asyncio
async def test_create_tracks_happy(db_path):
    r = await create_tracks(items=[{"title": "Beat A"}, {"title": "Beat B", "bpm": 140}])
    p = await _payload(db_path, r["token"])
    assert len(p["items"]) == 2
    assert p["items"][0]["title"] == "Beat A"
    assert p["items"][1]["bpm"] == 140
    assert "Beat A" in " · ".join(p["preview"]["sample"])


@pytest.mark.asyncio
async def test_create_tracks_rejects_empty(db_path):
    with pytest.raises(ValueError):
        await create_tracks(items=[])


@pytest.mark.asyncio
async def test_create_tracks_rejects_missing_title(db_path):
    with pytest.raises(ValueError, match="title"):
        await create_tracks(items=[{"bpm": 100}])  # type: ignore[list-item]


@pytest.mark.asyncio
async def test_create_tracks_caps_at_100(db_path):
    with pytest.raises(ValueError, match="100"):
        await create_tracks(items=[{"title": f"#{i}"} for i in range(101)])


@pytest.mark.asyncio
async def test_create_tracks_rejects_unknown_field(db_path):
    with pytest.raises(ValueError, match="unknown"):
        await create_tracks(items=[{"title": "x", "frobnicate": True}])  # type: ignore[list-item]


@pytest.mark.asyncio
async def test_attach_asset_audio_happy(db_path, tmp_path):
    audio = tmp_path / "beat.wav"
    audio.write_bytes(b"RIFF\x00\x00\x00\x00WAVEfmt ")
    r = await attach_asset(track_id=1, role="audio", path=str(audio))
    p = await _payload(db_path, r["token"])
    assert p["track_id"] == 1
    assert p["role"] == "audio"
    assert p["path"] == str(audio)


@pytest.mark.asyncio
async def test_attach_asset_rejects_missing_file(db_path):
    with pytest.raises(ValueError, match="not found"):
        await attach_asset(track_id=1, role="audio", path="/no/such/file.wav")


@pytest.mark.asyncio
async def test_attach_asset_rejects_bad_extension(db_path, tmp_path):
    f = tmp_path / "beat.txt"
    f.write_text("nope")
    with pytest.raises(ValueError, match="extension"):
        await attach_asset(track_id=1, role="audio", path=str(f))


@pytest.mark.asyncio
async def test_attach_asset_rejects_missing_track(db_path, tmp_path):
    f = tmp_path / "b.wav"
    f.write_bytes(b"x")
    with pytest.raises(ValueError, match="track_id"):
        await attach_asset(track_id=999, role="audio", path=str(f))


@pytest.mark.asyncio
async def test_attach_asset_warns_on_replacement(db_path, tmp_path):
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            "INSERT INTO asset (track_id, role, abs_path, created_at, updated_at) "
            "VALUES (1, 'audio', '/old.wav', ?, ?)",
            (now, now),
        )
        await conn.commit()
    f = tmp_path / "new.wav"
    f.write_bytes(b"x")
    r = await attach_asset(track_id=1, role="audio", path=str(f))
    p = await _payload(db_path, r["token"])
    assert any("replac" in w.lower() for w in p["preview"]["warnings"])
