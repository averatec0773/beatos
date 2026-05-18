"""get_track: single full Track payload."""
from __future__ import annotations

import aiosqlite
import pytest

from beatos_mcp.tools.tracks import TrackNotFound, get_track


@pytest.mark.asyncio
async def test_get_track_returns_full_row(fresh_db):
    async with aiosqlite.connect(fresh_db) as conn:
        cur = await conn.execute(
            "INSERT INTO track (title, bpm, key_signature, description, description_draft, "
            "created_at, updated_at) "
            "VALUES ('My Beat', 130, 'Am', 'final desc', 'draft desc', '2026-05-18', '2026-05-18')"
        )
        await conn.commit()
        track_id = cur.lastrowid

    result = await get_track(track_id)
    assert result["id"] == track_id
    assert result["title"] == "My Beat"
    assert result["bpm"] == 130
    assert result["key_signature"] == "Am"
    assert result["description"] == "final desc"
    assert result["description_draft"] == "draft desc"
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
