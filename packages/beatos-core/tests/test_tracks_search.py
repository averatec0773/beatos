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


@pytest.mark.asyncio
async def test_underscore_is_literal_not_single_char_wildcard():
    """A user's '_' must match a literal underscore, not any single char."""
    await create_track("abc")
    await create_track("a_c")
    rows = await list_tracks(text=["a_c"])
    titles = {r.title for r in rows}
    assert "a_c" in titles
    assert "abc" not in titles


@pytest.mark.asyncio
async def test_percent_is_literal_not_match_all_wildcard():
    """A user's '%' must match a literal percent, not every row."""
    await create_track("clean title")
    await create_track("50% off")
    rows = await list_tracks(text=["%"])
    titles = {r.title for r in rows}
    assert "50% off" in titles
    assert "clean title" not in titles


@pytest.mark.asyncio
async def test_genres_like_substring_matches(seeded_tracks):
    """QA P1-5: field-token `genre:` substring-matches (genres_like)."""
    t = await create_track("Memphis Track")
    await update_track(t.id, {"genre": ["Memphis Rap"]})
    rows = await list_tracks(genres_like=["Memphis"])
    assert [r.title for r in rows] == ["Memphis Track"]


@pytest.mark.asyncio
async def test_keys_like_substring_matches(seeded_tracks):
    """QA P1-5: `key:F` finds 'Fm' / 'F minor' (scalar column substring)."""
    rows = await list_tracks(keys_like=["F"])
    # seeded t1 has key 'Fm'
    assert any(r.title == "Midnight Drive" for r in rows)
    assert all(r.title != "Sunrise" for r in rows)  # 'Gm' must not match


@pytest.mark.asyncio
async def test_genres_like_case_insensitive():
    # isolated (no seeded fixture) so only our two rows exist
    t = await create_track("Mixed Case")
    await update_track(t.id, {"genre": ["Hyperpop"]})
    other = await create_track("Other")
    await update_track(other.id, {"genre": ["lofi"]})
    rows = await list_tracks(genres_like=["hyperpop"])
    assert [r.title for r in rows] == ["Mixed Case"]


@pytest.mark.asyncio
async def test_exact_genres_still_exact(seeded_tracks):
    """QA P1-5 must NOT loosen the exact `genres=` list_tracks param."""
    t = await create_track("Memphis Track")
    await update_track(t.id, {"genre": ["Memphis Rap"]})
    # exact 'Memphis' does not equal 'Memphis Rap'
    rows = await list_tracks(genres=["Memphis"])
    assert rows == []
    rows = await list_tracks(genres=["Memphis Rap"])
    assert [r.title for r in rows] == ["Memphis Track"]


@pytest.mark.asyncio
async def test_genres_like_ands_with_other_filters(seeded_tracks):
    """Multiple field tokens narrow (AND), not union."""
    rows = await list_tracks(genres_like=["trap"], keys_like=["F"])
    assert [r.title for r in rows] == ["Midnight Drive"]
    rows = await list_tracks(genres_like=["trap"], keys_like=["G"])
    assert rows == []


@pytest.mark.asyncio
async def test_top_values_orders_by_count_desc():
    from beatos_core.tracks.service import list_top_values
    t1 = await create_track("A"); await update_track(t1.id, {"genre": ["trap"]})
    t2 = await create_track("B"); await update_track(t2.id, {"genre": ["drill"]})
    t3 = await create_track("C"); await update_track(t3.id, {"genre": ["trap"]})
    rows = await list_top_values("genre", limit=10)
    assert rows[0] == {"value": "trap", "count": 2}
    assert {"value": "drill", "count": 1} in rows


@pytest.mark.asyncio
async def test_top_values_tie_break_alphabetical():
    from beatos_core.tracks.service import list_top_values
    t1 = await create_track("A"); await update_track(t1.id, {"genre": ["drill"]})
    t2 = await create_track("B"); await update_track(t2.id, {"genre": ["afro"]})
    rows = await list_top_values("genre", limit=10)
    # equal counts (1 each) -> alphabetical: afro before drill
    assert [r["value"] for r in rows] == ["afro", "drill"]
