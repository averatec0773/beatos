"""Tests for beatos_core.tracks.service."""
import pathlib

import aiosqlite
import pytest

from beatos_core.db import run_migrations
from beatos_core.db import resolve_db_path
from beatos_core.tracks.service import (
    count_tracks,
    create_track,
    delete_track,
    get_track,
    list_tracks,
    update_track,
)


@pytest.fixture(autouse=True)
async def _fresh_db(tmp_path, monkeypatch):
    """Each test gets its own isolated global DB with migrations applied."""
    db_path = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(db_path))
    await run_migrations(db_path)

    yield


@pytest.fixture
def attach_audio_helper(tmp_path):
    """Return an async helper that attaches an audio file asset to a track."""
    from beatos_core.assets.service import attach_asset

    async def _helper(track_id: int, role: str = "audio_tagged"):
        audio = tmp_path / f"audio_{track_id}_{role}.wav"
        audio.write_bytes(b"\x00" * 64)
        return await attach_asset(track_id, role=role, path=audio)

    return _helper


@pytest.fixture
def attach_cover_helper(tmp_path):
    """Return an async helper that attaches a cover image asset to a track."""
    from beatos_core.assets.service import attach_asset

    async def _helper(track_id: int) -> None:
        img = tmp_path / f"cover_{track_id}.jpg"
        img.write_bytes(b"\x00" * 64)
        await attach_asset(track_id, role="cover", path=img)

    return _helper


@pytest.mark.asyncio
async def test_create_returns_track_with_id():
    t = await create_track("Untitled")
    assert t.id > 0
    assert t.title == "Untitled"


@pytest.mark.asyncio
async def test_list_returns_all_tracks_ordered_by_updated_at_desc():
    a = await create_track("A")
    b = await create_track("B")

    rows = await list_tracks()

    # Newest first (B was created last).
    assert [r.id for r in rows] == [b.id, a.id]


@pytest.mark.asyncio
async def test_update_partial_preserves_other_fields():
    t = await create_track("Untitled")

    updated = await update_track(t.id, {"bpm": 140})

    assert updated.bpm == 140
    assert updated.title == "Untitled"


@pytest.mark.asyncio
async def test_update_rejects_unknown_field():
    t = await create_track("Untitled")

    with pytest.raises(ValueError):
        await update_track(t.id, {"nonexistent_field": "x"})


@pytest.mark.asyncio
async def test_delete_removes_track():
    t = await create_track("Untitled")

    await delete_track(t.id)

    rows = await list_tracks()
    assert rows == []
    # delete_track now soft-deletes; row still exists with deleted_at set
    after = await get_track(t.id)
    assert after is not None
    assert after.deleted_at is not None


@pytest.mark.asyncio
async def test_get_returns_none_for_missing_id():
    assert await get_track(99999) is None


@pytest.mark.asyncio
async def test_create_track_returns_producer_none_by_default():
    t = await create_track("New")
    assert t.producer is None
    assert t.has_audio is False


@pytest.mark.asyncio
async def test_update_track_can_set_producer():
    t = await create_track("New")
    updated = await update_track(t.id, {"producer": ["averatec0773"]})
    assert updated.producer == ["averatec0773"]


@pytest.mark.asyncio
async def test_list_tracks_has_audio_true_when_audio_asset_attached(attach_audio_helper):
    t = await create_track("New")
    await attach_audio_helper(t.id, role="audio_tagged")
    rows = await list_tracks()
    [row] = [r for r in rows if r.id == t.id]
    assert row.has_audio is True


@pytest.mark.asyncio
async def test_list_tracks_has_audio_false_for_cover_only(attach_cover_helper):
    t = await create_track("New")
    await attach_cover_helper(t.id)
    rows = await list_tracks()
    [row] = [r for r in rows if r.id == t.id]
    assert row.has_audio is False


@pytest.mark.asyncio
async def test_list_tracks_has_audio_true_when_mp3_attached(attach_audio_helper):
    t = await create_track("New")
    await attach_audio_helper(t.id, role="audio_tagged")
    rows = await list_tracks()
    [row] = [r for r in rows if r.id == t.id]
    assert row.has_audio is True


@pytest.mark.asyncio
async def test_list_tracks_has_audio_true_when_untagged_mp3_attached(attach_audio_helper):
    t = await create_track("New")
    await attach_audio_helper(t.id, role="audio_untagged")
    rows = await list_tracks()
    [row] = [r for r in rows if r.id == t.id]
    assert row.has_audio is True


@pytest.mark.asyncio
async def test_list_tracks_has_audio_true_when_untagged_wav_attached(attach_audio_helper):
    t = await create_track("New")
    await attach_audio_helper(t.id, role="audio_untagged")
    rows = await list_tracks()
    [row] = [r for r in rows if r.id == t.id]
    assert row.has_audio is True


@pytest.mark.asyncio
async def test_count_tracks_excludes_trashed():
    assert await count_tracks() == 0
    t1 = await create_track("a")
    await create_track("b")
    await create_track("c")
    assert await count_tracks() == 3
    await delete_track(t1.id)
    assert await count_tracks() == 2


@pytest.mark.asyncio
async def test_has_audio_false_when_audio_asset_is_missing(attach_audio_helper):
    t = await create_track("New")
    asset = await attach_audio_helper(t.id, role="audio_tagged")
    async with aiosqlite.connect(resolve_db_path()) as conn:
        await conn.execute("UPDATE asset SET missing = 1 WHERE id = ?", (asset.id,))
        await conn.commit()
    rows = await list_tracks()
    [row] = [r for r in rows if r.id == t.id]
    assert row.has_audio is False
