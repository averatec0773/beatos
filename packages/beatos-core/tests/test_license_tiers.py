"""Tests for license_tier service (v0.0.26)."""

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
        prices={"CNY": 50.0, "USD": 8.0},
        notes="Up to 5000 streams",
    )
    assert tier.id > 0
    assert tier.track_id == track.id
    assert tier.position == 0
    assert tier.name == "MP3 Lease"
    assert tier.deliverables == ["mp3"]
    assert tier.prices == {"CNY": 50.0, "USD": 8.0}
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
async def test_create_accepts_empty_name():
    """v0.0.26.2: empty name is allowed; renderer auto-derives a display
    label from deliverables. The non-empty rule was an over-zealous guard."""
    track = await create_track("Beat")
    tier = await create_tier(track.id, name="")
    assert tier.id > 0
    assert tier.name == ""


@pytest.mark.asyncio
async def test_update_partial_only_touches_given_fields():
    track = await create_track("Beat")
    tier = await create_tier(
        track.id, name="MP3", prices={"CNY": 50.0}, notes="orig"
    )
    updated = await update_tier(tier.id, {"prices": {"CNY": 75.0}})
    assert updated.prices == {"CNY": 75.0}
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
            {"name": "MP3", "deliverables": ["mp3"], "prices": {"CNY": 50.0}},
            {
                "name": "WAV",
                "deliverables": ["mp3", "wav"],
                "prices": {"CNY": 150.0, "USD": 25.0},
            },
        ],
    )
    assert [t.name for t in new] == ["MP3", "WAV"]
    assert [t.position for t in new] == [0, 1]
    assert new[1].prices == {"CNY": 150.0, "USD": 25.0}


@pytest.mark.asyncio
async def test_replace_with_empty_clears_all():
    track = await create_track("Beat")
    await create_tier(track.id, name="MP3")
    result = await replace_tiers_for_track(track.id, [])
    assert result == []
    assert await list_tiers_for_track(track.id) == []


@pytest.mark.asyncio
async def test_create_rejects_duplicate_deliverables():
    """Two tiers with the same deliverables set are not allowed —
    duplicates are confusing in publish-adapter output and the renderer
    auto-derives display labels from deliverables (so duplicates would
    share the same label)."""
    track = await create_track("Beat")
    await create_tier(track.id, name="", deliverables=["mp3"])
    with pytest.raises(ValueError, match="already exists"):
        await create_tier(track.id, name="other", deliverables=["mp3"])


@pytest.mark.asyncio
async def test_create_dedup_is_order_insensitive_and_case_insensitive():
    track = await create_track("Beat")
    await create_tier(track.id, name="", deliverables=["mp3", "wav"])
    with pytest.raises(ValueError, match="already exists"):
        await create_tier(track.id, name="", deliverables=["WAV", "MP3"])


@pytest.mark.asyncio
async def test_create_allows_multiple_empty_deliverables():
    """Empty deliverables = mid-edit state; coexisting empty rows are OK."""
    track = await create_track("Beat")
    a = await create_tier(track.id, name="", deliverables=[])
    b = await create_tier(track.id, name="", deliverables=[])
    assert a.id != b.id


@pytest.mark.asyncio
async def test_update_to_existing_deliverables_rejected():
    track = await create_track("Beat")
    a = await create_tier(track.id, name="", deliverables=["mp3"])
    b = await create_tier(track.id, name="", deliverables=["wav"])
    with pytest.raises(ValueError, match="already exists"):
        await update_tier(b.id, {"deliverables": ["mp3"]})
    # original survives
    refreshed = await get_tier(a.id)
    assert refreshed and refreshed.deliverables == ["mp3"]


@pytest.mark.asyncio
async def test_update_same_deliverables_on_self_allowed():
    """A no-op (or unrelated-field) update on a tier must not see its own
    row as a duplicate."""
    track = await create_track("Beat")
    a = await create_tier(track.id, name="", deliverables=["mp3"])
    updated = await update_tier(
        a.id, {"deliverables": ["mp3"], "prices": {"CNY": 99.0}}
    )
    assert updated.prices == {"CNY": 99.0}


@pytest.mark.asyncio
async def test_replace_rejects_duplicate_within_batch():
    track = await create_track("Beat")
    with pytest.raises(ValueError, match="Duplicate deliverables"):
        await replace_tiers_for_track(
            track.id,
            [
                {"name": "A", "deliverables": ["mp3"]},
                {"name": "B", "deliverables": ["MP3"]},
            ],
        )


@pytest.mark.asyncio
async def test_create_with_empty_prices():
    """Empty `prices` map = tier exists but is unpriced (e.g. fresh row
    the user hasn't filled yet). Must not raise."""
    track = await create_track("Beat")
    tier = await create_tier(track.id, deliverables=["mp3"])
    assert tier.prices == {}


@pytest.mark.asyncio
async def test_prices_keys_are_uppercased():
    """Currency codes round-trip in canonical uppercase regardless of input."""
    track = await create_track("Beat")
    tier = await create_tier(
        track.id, deliverables=["mp3"], prices={"cny": 100, "usd": 15}
    )
    assert tier.prices == {"CNY": 100.0, "USD": 15.0}


@pytest.mark.asyncio
async def test_prices_rejects_negative_amount():
    track = await create_track("Beat")
    with pytest.raises(ValueError, match=">= 0"):
        await create_tier(track.id, deliverables=["mp3"], prices={"CNY": -10})


@pytest.mark.asyncio
async def test_prices_rejects_non_dict():
    track = await create_track("Beat")
    with pytest.raises(ValueError, match="object mapping"):
        await create_tier(track.id, deliverables=["mp3"], prices=[("CNY", 10)])  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_update_prices_is_whole_replace():
    """The `prices` field is whole-replace, not per-key merge: a partial
    update with one currency wipes the others. Renderer is expected to
    pass the complete map every time."""
    track = await create_track("Beat")
    tier = await create_tier(
        track.id, deliverables=["mp3"], prices={"CNY": 300, "USD": 50}
    )
    updated = await update_tier(tier.id, {"prices": {"CNY": 400}})
    assert updated.prices == {"CNY": 400.0}


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
