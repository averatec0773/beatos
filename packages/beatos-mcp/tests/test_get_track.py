"""get_track: single full Track payload."""
from __future__ import annotations

import aiosqlite
import pytest

from beatos_mcp.tools.tracks import TrackNotFound, get_track


@pytest.mark.asyncio
async def test_get_track_returns_full_row(fresh_db):
    async with aiosqlite.connect(fresh_db) as conn:
        cur = await conn.execute(
            "INSERT INTO track (title, bpm, key_signature, description, "
            "created_at, updated_at) "
            "VALUES ('My Beat', 130, 'Am', 'final desc', '2026-05-18', '2026-05-18')"
        )
        await conn.commit()
        track_id = cur.lastrowid

    result = await get_track(track_id)
    assert result["id"] == track_id
    assert result["title"] == "My Beat"
    assert result["bpm"] == 130
    assert result["key_signature"] == "Am"
    assert result["description"] == "final desc"
    assert result["assets"] == []


@pytest.mark.asyncio
async def test_get_track_includes_assets(fresh_db):
    async with aiosqlite.connect(fresh_db) as conn:
        cur = await conn.execute(
            "INSERT INTO track (title, created_at, updated_at) "
            "VALUES ('T', '2026-05-18', '2026-05-18')"
        )
        await conn.commit()
        tid = cur.lastrowid
        await conn.execute(
            "INSERT INTO asset (track_id, role, abs_path, missing, created_at, updated_at) "
            "VALUES (?, 'audio_tagged_wav', '/x/y.wav', 0, '2026-05-18', '2026-05-18')",
            (tid,),
        )
        await conn.commit()

    result = await get_track(tid)
    assert len(result["assets"]) == 1
    a = result["assets"][0]
    assert a["role"] == "audio_tagged_wav"
    assert a["abs_path"] == "/x/y.wav"
    assert a["missing"] is False


@pytest.mark.asyncio
async def test_get_track_missing_raises(fresh_db):
    with pytest.raises(TrackNotFound, match="Track 999"):
        await get_track(999)


@pytest.mark.asyncio
async def test_get_track_exposes_is_free_project_path_and_asset_format(fresh_db):
    """Read-surface parity (rules 18/19): fields agents can write must be
    readable back. is_free, project_path, and asset.format were historically
    missing from the MCP read columns — this pins them in."""
    async with aiosqlite.connect(fresh_db) as conn:
        cur = await conn.execute(
            "INSERT INTO track (title, is_free, project_path, created_at, updated_at) "
            "VALUES ('Free Beat', 1, '/proj/beat1', '2026-07-06', '2026-07-06')"
        )
        await conn.commit()
        tid = cur.lastrowid
        await conn.execute(
            "INSERT INTO asset "
            "(track_id, role, abs_path, missing, format, created_at, updated_at) "
            "VALUES (?, 'audio_tagged', '/x/y.wav', 0, 'wav', '2026-07-06', '2026-07-06')",
            (tid,),
        )
        await conn.commit()

    result = await get_track(tid)
    assert result["is_free"] is True
    assert result["project_path"] == "/proj/beat1"
    assert result["assets"][0]["format"] == "wav"
