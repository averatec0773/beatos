"""Tests for the first-launch demo seed (beatos_http.seed.demo)."""
from __future__ import annotations

import pytest

from beatos_core.app_settings.service import get_setting
from beatos_core.assets.service import list_assets
from beatos_core.db import run_migrations
from beatos_core.licenses.service import list_tiers_for_track
from beatos_core.tracks.service import create_track, list_tracks, purge_track

from beatos_http.seed.demo import _BUNDLED_DIR, seed_demo_if_needed


@pytest.fixture
def fake_source(tmp_path):
    """Tiny stand-in assets so the test never copies the real ~5 MB files.
    read_audio_metadata is exception-safe, so non-audio bytes are fine."""
    src = tmp_path / "seed_assets"
    src.mkdir()
    (src / "regalia.mp3").write_bytes(b"ID3 fake audio bytes")
    (src / "regalia-cover.jpg").write_bytes(b"\xff\xd8\xff\xe0 fake jpeg")
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
    assert len(tracks) == 1
    t = tracks[0]
    assert t.title == "REGALIA"
    assert t.bpm == 127
    assert t.key_signature == "D minor"
    assert t.genre == ["Regalia"]
    assert t.mood == ["Epic", "Grand", "Dark"]
    assert t.producer == ["Averatec"]
    assert t.is_free is True

    roles = {a.role for a in await list_assets(t.id)}
    assert roles == {"audio_tagged", "cover"}

    # Files copied into the stable user-data demo dir (next to the db).
    demo_dir = db.parent / "demo"
    assert (demo_dir / "regalia.mp3").exists()
    assert (demo_dir / "regalia-cover.jpg").exists()

    tiers = await list_tiers_for_track(t.id)
    assert len(tiers) == 1
    assert tiers[0].deliverables == ["mp3"]
    assert tiers[0].prices == {"CNY": 128.0}

    assert await get_setting("demo_seeded") is True


async def test_idempotent_no_duplicate(db, fake_source):
    await run_migrations(db)
    assert await seed_demo_if_needed(source_dir=fake_source) is True
    assert await seed_demo_if_needed(source_dir=fake_source) is False
    assert len(await list_tracks()) == 1


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
    t = (await list_tracks())[0]
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
    assert (_BUNDLED_DIR / "regalia.mp3").exists()
    assert (_BUNDLED_DIR / "regalia-cover.jpg").exists()
