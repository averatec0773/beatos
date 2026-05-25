"""Tests for free-text q search in list_tracks."""
import pytest

from beatos_core.db import run_migrations
from beatos_core.tracks.service import create_track, list_tracks, update_track


@pytest.fixture(autouse=True)
async def _fresh_db(tmp_path, monkeypatch):
    db_path = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(db_path))
    await run_migrations(db_path)
    yield


@pytest.fixture
async def seeded_tracks():
    t1 = await create_track("Midnight Drive")
    await update_track(t1.id, {
        "producer": ["AVERATEC"],
        "genre": ["trap"],
        "key_signature": "Fm",
        "bpm": 140,
        "description": "dark moody beat",
    })
    t2 = await create_track("Sunrise")
    await update_track(t2.id, {
        "producer": ["smoke"],
        "genre": ["drill"],
        "key_signature": "Gm",
        "bpm": 150,
    })
    return t1, t2


@pytest.mark.asyncio
async def test_q_matches_producer(seeded_tracks):
    rows = await list_tracks(q="AVERATEC")
    assert len(rows) == 1
    assert rows[0].title == "Midnight Drive"


@pytest.mark.asyncio
async def test_q_matches_description(seeded_tracks):
    rows = await list_tracks(q="moody")
    assert len(rows) == 1
    assert rows[0].title == "Midnight Drive"


@pytest.mark.asyncio
async def test_q_case_insensitive_title(seeded_tracks):
    rows = await list_tracks(q="midnight")
    assert len(rows) == 1
    assert rows[0].title == "Midnight Drive"


@pytest.mark.asyncio
async def test_q_multi_term_and_no_match(seeded_tracks):
    rows = await list_tracks(q="dark sunrise")
    assert rows == []


@pytest.mark.asyncio
async def test_q_multi_term_and_match(seeded_tracks):
    rows = await list_tracks(q="midnight dark")
    assert len(rows) == 1
    assert rows[0].title == "Midnight Drive"


@pytest.mark.asyncio
async def test_q_combined_with_genre_match(seeded_tracks):
    rows = await list_tracks(q="beat", genres=["trap"])
    assert len(rows) == 1
    assert rows[0].title == "Midnight Drive"


@pytest.mark.asyncio
async def test_q_combined_with_genre_no_match(seeded_tracks):
    rows = await list_tracks(q="beat", genres=["drill"])
    assert rows == []
