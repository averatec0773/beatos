"""Tests for sort + filter params on list_tracks and list_distinct_values."""
import pytest

from beatos_core.db import run_migrations
from beatos_core.tracks.service import (
    create_track,
    list_tracks,
    list_distinct_values,
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
    from beatos_core.assets.service import attach_asset

    async def _helper(track_id: int, role: str = "audio_tagged"):
        audio = tmp_path / f"audio_{track_id}_{role}.wav"
        audio.write_bytes(b"\x00" * 64)
        return await attach_asset(track_id, role=role, path=audio)

    return _helper


# --- sort_by / sort_dir ---

@pytest.mark.asyncio
async def test_list_tracks_sort_by_title_asc():
    c = await create_track("C")
    a = await create_track("A")
    b = await create_track("B")
    rows = await list_tracks(sort_by="title", sort_dir="asc")
    assert [r.title for r in rows] == ["A", "B", "C"]


@pytest.mark.asyncio
async def test_list_tracks_sort_by_title_desc():
    c = await create_track("C")
    a = await create_track("A")
    b = await create_track("B")
    rows = await list_tracks(sort_by="title", sort_dir="desc")
    assert [r.title for r in rows] == ["C", "B", "A"]


@pytest.mark.asyncio
async def test_list_tracks_invalid_sort_by_raises():
    with pytest.raises(ValueError, match="sort_by"):
        await list_tracks(sort_by="invalid_field")


@pytest.mark.asyncio
async def test_list_tracks_invalid_sort_dir_raises():
    with pytest.raises(ValueError, match="sort_dir"):
        await list_tracks(sort_dir="up")


@pytest.mark.asyncio
async def test_list_tracks_default_no_args_still_works():
    a = await create_track("A")
    b = await create_track("B")
    rows = await list_tracks()
    # Default: updated_at desc — newest first (B was created last)
    assert rows[0].id == b.id
    assert rows[1].id == a.id


# --- producer filter ---

@pytest.mark.asyncio
async def test_list_tracks_filter_producers():
    a = await create_track("A")
    b = await create_track("B")
    c = await create_track("C")
    await update_track(a.id, {"producer": ["Alice"]})
    await update_track(b.id, {"producer": ["Bob"]})
    await update_track(c.id, {"producer": ["Charlie"]})

    rows = await list_tracks(producers=["Alice", "Bob"])
    titles = {r.title for r in rows}
    assert titles == {"A", "B"}


@pytest.mark.asyncio
async def test_list_tracks_filter_producers_or_within_field():
    a = await create_track("A")
    b = await create_track("B")
    await update_track(a.id, {"producer": ["Alice"]})
    await update_track(b.id, {"producer": ["Bob"]})

    rows = await list_tracks(producers=["Alice", "Bob"])
    assert len(rows) == 2


# --- AND across fields ---

@pytest.mark.asyncio
async def test_list_tracks_filter_producer_and_genre():
    a = await create_track("A")
    b = await create_track("B")
    c = await create_track("C")
    await update_track(a.id, {"producer": ["Alice"], "genre": ["hip-hop"]})
    await update_track(b.id, {"producer": ["Alice"], "genre": ["lo-fi"]})
    await update_track(c.id, {"producer": ["Bob"], "genre": ["hip-hop"]})

    rows = await list_tracks(producers=["Alice"], genres=["hip-hop"])
    assert len(rows) == 1
    assert rows[0].title == "A"


# --- BPM range filter ---

@pytest.mark.asyncio
async def test_list_tracks_bpm_between_inclusive():
    a = await create_track("A")
    b = await create_track("B")
    c = await create_track("C")
    await update_track(a.id, {"bpm": 90})
    await update_track(b.id, {"bpm": 120})
    await update_track(c.id, {"bpm": 150})

    rows = await list_tracks(bpm_min=100, bpm_max=140)
    assert len(rows) == 1
    assert rows[0].title == "B"


@pytest.mark.asyncio
async def test_list_tracks_bpm_min_only():
    a = await create_track("A")
    b = await create_track("B")
    await update_track(a.id, {"bpm": 80})
    await update_track(b.id, {"bpm": 140})

    rows = await list_tracks(bpm_min=100)
    assert len(rows) == 1
    assert rows[0].title == "B"


# --- has_audio filter ---

@pytest.mark.asyncio
async def test_list_tracks_has_audio_true(attach_audio_helper):
    a = await create_track("WithAudio")
    b = await create_track("NoAudio")
    await attach_audio_helper(a.id)

    rows = await list_tracks(has_audio=True)
    assert len(rows) == 1
    assert rows[0].title == "WithAudio"


@pytest.mark.asyncio
async def test_list_tracks_has_audio_false(attach_audio_helper):
    a = await create_track("WithAudio")
    b = await create_track("NoAudio")
    await attach_audio_helper(a.id)

    rows = await list_tracks(has_audio=False)
    assert len(rows) == 1
    assert rows[0].title == "NoAudio"


# --- list_distinct_values ---

@pytest.mark.asyncio
async def test_distinct_values_producer():
    t1 = await create_track("T1")
    t2 = await create_track("T2")
    t3 = await create_track("T3")
    await update_track(t1.id, {"producer": ["x"]})
    await update_track(t2.id, {"producer": ["y"]})
    await update_track(t3.id, {"producer": ["x"]})

    vals = await list_distinct_values("producer")
    assert vals == ["x", "y"]


@pytest.mark.asyncio
async def test_distinct_values_genre():
    t1 = await create_track("T1")
    t2 = await create_track("T2")
    await update_track(t1.id, {"genre": ["hip-hop"]})
    await update_track(t2.id, {"genre": ["lo-fi"]})

    vals = await list_distinct_values("genre")
    assert vals == ["hip-hop", "lo-fi"]


@pytest.mark.asyncio
async def test_distinct_values_excludes_null():
    t1 = await create_track("T1")
    t2 = await create_track("T2")
    await update_track(t1.id, {"producer": ["Alice"]})
    # t2 has no producer set

    vals = await list_distinct_values("producer")
    assert vals == ["Alice"]


@pytest.mark.asyncio
async def test_distinct_values_rejects_unknown_field():
    with pytest.raises(ValueError):
        await list_distinct_values("description")


@pytest.mark.asyncio
async def test_distinct_values_empty_table():
    vals = await list_distinct_values("producer")
    assert vals == []
