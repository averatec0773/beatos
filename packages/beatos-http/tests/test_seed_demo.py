"""Tests for the first-launch demo seed (beatos_http.seed.demo)."""
from __future__ import annotations

import pytest

from beatos_core.app_settings.service import get_setting
from beatos_core.assets.service import list_assets
from beatos_core.db import run_migrations
from beatos_core.licenses.service import list_tiers_for_track
from beatos_core.tracks.service import create_track, list_tracks, purge_track

from beatos_http.seed.demo import _BUNDLED_DIR, _DEMO_TRACKS, seed_demo_if_needed

_EXPECTED_TITLES = {"template1", "template2", "template3"}
_EXPECTED_PRICES = [{"CNY": 128.0}, {"CNY": 188.0}, {"CNY": 288.0}]
_EXPECTED_DELIVERABLES = [["mp3"], ["wav"], ["stem"]]


@pytest.fixture
def fake_source(tmp_path):
    """Tiny stand-in assets so the test never copies the real ~20 MB of audio.
    read_audio_metadata is exception-safe, so non-audio bytes are fine; asset
    format is derived from the extension, not the content."""
    src = tmp_path / "seed_assets"
    src.mkdir()
    for spec in _DEMO_TRACKS:
        (src / spec["audio"]).write_bytes(b"ID3 fake audio bytes")
        (src / spec["cover"]).write_bytes(b"\xff\xd8\xff\xe0 fake jpeg")
    return src


@pytest.fixture
def db(tmp_path, monkeypatch):
    db_path = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(db_path))
    return db_path


async def test_seeds_empty_library(db, fake_source):
    await run_migrations(db)
    assert await seed_demo_if_needed(source_dir=fake_source) is True

    tracks = await list_tracks()
    assert len(tracks) == 3
    by_title = {t.title: t for t in tracks}
    assert set(by_title) == _EXPECTED_TITLES

    # Every template is free (non-commercial download) AND carries paid tiers.
    for t in tracks:
        assert t.is_free is True
        roles = {a.role for a in await list_assets(t.id)}
        assert roles == {"audio_tagged", "cover"}
        tiers = await list_tiers_for_track(t.id)
        assert [tier.deliverables for tier in tiers] == _EXPECTED_DELIVERABLES
        assert [tier.prices for tier in tiers] == _EXPECTED_PRICES

    # Spot-check per-track metadata. Titles are the generic template labels; the
    # real beat metadata (and its NetEase reference link in `description`) rides
    # underneath, mapped by song identity.
    t1 = by_title["template1"]  # REGALIA beat
    assert t1.bpm == 127
    assert t1.key_signature == "D minor"
    assert t1.genre == ["Regalia"]
    assert t1.mood == ["Epic", "Grand", "Dark"]
    assert t1.producer == ["Averatec"]
    assert t1.description == "https://music.163.com/#/song?id=2155196363"

    t2 = by_title["template2"]  # 寒江雪 beat
    assert t2.bpm == 137
    assert t2.genre == ["Chinese Hip Hop"]
    assert t2.mood == ["Sacred", "Psychedelic"]
    # "averatec" canonicalizes to the first-seen casing "Averatec".
    assert t2.producer == ["yusician", "Averatec"]
    assert t2.description == "https://music.163.com/#/song?id=3374182565"

    t3 = by_title["template3"]  # 契约 beat
    assert t3.bpm == 152
    assert t3.genre == ["Melodic Rap"]
    assert t3.mood == ["Elegant", "Sacred", "Epic"]
    assert t3.producer == ["4Harry", "Averatec"]
    assert t3.description == "https://music.163.com/#/song?id=3391062994"

    # Files copied into the stable user-data demo dir (next to the db).
    demo_dir = db.parent / "demo"
    for spec in _DEMO_TRACKS:
        assert (demo_dir / spec["audio"]).exists()
        assert (demo_dir / spec["cover"]).exists()

    assert await get_setting("demo_seeded") is True


async def test_idempotent_no_duplicate(db, fake_source):
    await run_migrations(db)
    assert await seed_demo_if_needed(source_dir=fake_source) is True
    assert await seed_demo_if_needed(source_dir=fake_source) is False
    assert len(await list_tracks()) == 3


async def test_skips_when_library_not_empty(db, fake_source):
    await run_migrations(db)
    await create_track("Pre-existing")
    assert await seed_demo_if_needed(source_dir=fake_source) is False
    assert {t.title for t in await list_tracks()} == {"Pre-existing"}
    # Marked handled so the demo never injects later.
    assert await get_setting("demo_seeded") is True


async def test_deleting_demo_does_not_resurrect_it(db, fake_source):
    await run_migrations(db)
    assert await seed_demo_if_needed(source_dir=fake_source) is True
    for t in await list_tracks():
        await purge_track(t.id)
    assert len(await list_tracks()) == 0
    # Next startup must not bring it back (flag already set).
    assert await seed_demo_if_needed(source_dir=fake_source) is False
    assert len(await list_tracks()) == 0


async def test_disable_env_skips_seeding(db, fake_source, monkeypatch):
    """BEATOS_DISABLE_DEMO_SEED=1 keeps a brand-new DB empty (smoke/CI use this),
    without setting the flag so a real later run could still seed."""
    monkeypatch.setenv("BEATOS_DISABLE_DEMO_SEED", "1")
    await run_migrations(db)
    assert await seed_demo_if_needed(source_dir=fake_source) is False
    assert len(await list_tracks()) == 0
    assert await get_setting("demo_seeded") is None


async def test_missing_bundled_assets_is_noop(db, tmp_path):
    await run_migrations(db)
    empty = tmp_path / "empty"
    empty.mkdir()
    assert await seed_demo_if_needed(source_dir=empty) is False
    assert len(await list_tracks()) == 0
    # Not marked: a missing-asset build problem should retry next startup.
    assert await get_setting("demo_seeded") is None


def test_bundled_assets_are_present():
    """Guards against the feature silently breaking if the files are removed."""
    for spec in _DEMO_TRACKS:
        assert (_BUNDLED_DIR / spec["audio"]).exists()
        assert (_BUNDLED_DIR / spec["cover"]).exists()
