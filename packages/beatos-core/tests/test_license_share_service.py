import datetime as dt

import aiosqlite
import pytest

from beatos_core.db import run_migrations
from beatos_core.licenses.service import (
    _normalize_share,
    create_tier,
    update_tier,
    get_tier,
    replace_tiers_for_track,
)


@pytest.fixture
async def db(tmp_path, monkeypatch):
    p = tmp_path / "t.db"
    await run_migrations(p)
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(p) as conn:
        await conn.execute("INSERT INTO track (id,title,created_at,updated_at) VALUES (1,'A',?,?)", (now, now))
        await conn.commit()
    return p


def test_normalize_share_valid_and_invalid():
    assert _normalize_share(None) is None
    assert _normalize_share(0) == 0.0
    assert _normalize_share(100) == 100.0
    assert _normalize_share(25.5) == 25.5
    for bad in (-1, 101, "x", True):
        with pytest.raises(ValueError):
            _normalize_share(bad)


@pytest.mark.asyncio
async def test_create_with_share(db):
    t = await create_tier(1, name="MP3", deliverables=["mp3"], prices={"CNY": 50}, share=25)
    assert t.share == 25.0
    again = await get_tier(t.id)
    assert again.share == 25.0


@pytest.mark.asyncio
async def test_create_without_share_is_null(db):
    t = await create_tier(1, name="MP3", deliverables=["mp3"], prices={"CNY": 50})
    assert t.share is None


@pytest.mark.asyncio
async def test_update_share(db):
    t = await create_tier(1, name="MP3", deliverables=["mp3"])
    updated = await update_tier(t.id, {"share": 30})
    assert updated.share == 30.0
    cleared = await update_tier(t.id, {"share": None})
    assert cleared.share is None


@pytest.mark.asyncio
async def test_update_share_out_of_range_rejected(db):
    t = await create_tier(1, name="MP3", deliverables=["mp3"])
    with pytest.raises(ValueError):
        await update_tier(t.id, {"share": 150})


@pytest.mark.asyncio
async def test_replace_tiers_carries_share(db):
    tiers = await replace_tiers_for_track(1, [
        {"name": "MP3", "deliverables": ["mp3"], "prices": {"CNY": 50}, "share": 25},
        {"name": "WAV", "deliverables": ["mp3", "wav"], "prices": {"CNY": 150}},
    ])
    by_name = {t.name: t for t in tiers}
    assert by_name["MP3"].share == 25.0
    assert by_name["WAV"].share is None
