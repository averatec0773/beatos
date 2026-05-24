"""Tests for license_tier service (v0.0.26)."""
import json

import pytest

from beatos_core.db import run_migrations, resolve_db_path
from beatos_core.licenses.service import (
    create_tier,
    delete_tier,
    get_tier,
    list_tiers_for_track,
    reorder_tiers,
    replace_tiers_for_track,
    update_tier,
)
from beatos_core.tracks.service import create_track


@pytest.fixture(autouse=True)
async def _fresh_db(tmp_path, monkeypatch):
    db_path = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(db_path))
    await run_migrations(db_path)
    yield


@pytest.mark.asyncio
async def test_create_then_list_round_trips():
    track = await create_track("Beat")
    tier = await create_tier(
        track.id,
        name="MP3 Lease",
        deliverables=["mp3"],
        price=50.0,
        notes="Up to 5000 streams",
    )
    assert tier.id > 0
    assert tier.track_id == track.id
    assert tier.position == 0
    assert tier.name == "MP3 Lease"
    assert tier.deliverables == ["mp3"]
    assert tier.price == 50.0
    assert tier.currency == "CNY"
    assert tier.notes == "Up to 5000 streams"

    listed = await list_tiers_for_track(track.id)
    assert [t.id for t in listed] == [tier.id]


@pytest.mark.asyncio
async def test_create_assigns_incrementing_positions():
    track = await create_track("Beat")
    a = await create_tier(track.id, name="MP3")
    b = await create_tier(track.id, name="WAV")
    c = await create_tier(track.id, name="Stems")
    assert (a.position, b.position, c.position) == (0, 1, 2)


@pytest.mark.asyncio
async def test_create_rejects_unknown_track():
    with pytest.raises(ValueError, match="not found"):
        await create_tier(9999, name="MP3")


@pytest.mark.asyncio
async def test_create_rejects_empty_name():
    track = await create_track("Beat")
    with pytest.raises(ValueError, match="name"):
        await create_tier(track.id, name="   ")


@pytest.mark.asyncio
async def test_update_partial_only_touches_given_fields():
    track = await create_track("Beat")
    tier = await create_tier(track.id, name="MP3", price=50.0, notes="orig")
    updated = await update_tier(tier.id, {"price": 75.0})
    assert updated.price == 75.0
    assert updated.notes == "orig"
    assert updated.name == "MP3"


@pytest.mark.asyncio
async def test_update_deliverables_replaces_array():
    track = await create_track("Beat")
    tier = await create_tier(track.id, name="MP3", deliverables=["mp3"])
    updated = await update_tier(tier.id, {"deliverables": ["mp3", "wav", "stem"]})
    assert updated.deliverables == ["mp3", "wav", "stem"]


@pytest.mark.asyncio
async def test_update_rejects_unknown_fields():
    track = await create_track("Beat")
    tier = await create_tier(track.id, name="MP3")
    with pytest.raises(ValueError, match="Unknown fields"):
        await update_tier(tier.id, {"bogus": "x"})


@pytest.mark.asyncio
async def test_delete_removes_row():
    track = await create_track("Beat")
    tier = await create_tier(track.id, name="MP3")
    await delete_tier(tier.id)
    assert await get_tier(tier.id) is None


@pytest.mark.asyncio
async def test_delete_unknown_raises():
    with pytest.raises(ValueError, match="not found"):
        await delete_tier(9999)


@pytest.mark.asyncio
async def test_reorder_changes_positions():
    track = await create_track("Beat")
    a = await create_tier(track.id, name="A")
    b = await create_tier(track.id, name="B")
    c = await create_tier(track.id, name="C")
    await reorder_tiers(track.id, [c.id, a.id, b.id])
    listed = await list_tiers_for_track(track.id)
    assert [t.id for t in listed] == [c.id, a.id, b.id]
    assert [t.position for t in listed] == [0, 1, 2]


@pytest.mark.asyncio
async def test_reorder_rejects_set_mismatch():
    track = await create_track("Beat")
    a = await create_tier(track.id, name="A")
    b = await create_tier(track.id, name="B")
    with pytest.raises(ValueError, match="does not match"):
        await reorder_tiers(track.id, [a.id])  # missing b
    # Untouched ordering still intact
    listed = await list_tiers_for_track(track.id)
    assert [t.id for t in listed] == [a.id, b.id]


@pytest.mark.asyncio
async def test_replace_tiers_is_atomic():
    track = await create_track("Beat")
    await create_tier(track.id, name="OldA")
    await create_tier(track.id, name="OldB")
    new = await replace_tiers_for_track(
        track.id,
        [
            {"name": "MP3", "deliverables": ["mp3"], "price": 50.0},
            {"name": "WAV", "deliverables": ["mp3", "wav"], "price": 150.0},
        ],
    )
    assert [t.name for t in new] == ["MP3", "WAV"]
    assert [t.position for t in new] == [0, 1]


@pytest.mark.asyncio
async def test_replace_with_empty_clears_all():
    track = await create_track("Beat")
    await create_tier(track.id, name="MP3")
    result = await replace_tiers_for_track(track.id, [])
    assert result == []
    assert await list_tiers_for_track(track.id) == []


@pytest.mark.asyncio
async def test_track_delete_cascades_to_tiers():
    """ON DELETE CASCADE on license_tier.track_id — verifies migration 013
    keeps the relational invariant."""
    import aiosqlite

    track = await create_track("Beat")
    await create_tier(track.id, name="MP3")
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute("PRAGMA foreign_keys = ON")
        await conn.execute("DELETE FROM track WHERE id = ?", (track.id,))
        await conn.commit()
        async with conn.execute(
            "SELECT COUNT(*) FROM license_tier WHERE track_id = ?", (track.id,)
        ) as cur:
            (n,) = await cur.fetchone()
    assert n == 0
