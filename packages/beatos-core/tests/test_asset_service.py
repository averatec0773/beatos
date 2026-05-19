"""Tests for asset attach / detach / relocate / missing_sweep."""
import datetime as _dt
import pathlib
import wave

import aiosqlite
import pytest

from beatos_core.assets.service import (
    attach_asset,
    detach_asset,
    get_asset,
    list_assets,
    list_assets_for_track,
    missing_sweep,
    relocate_asset,
)
from beatos_core.db import resolve_db_path, run_migrations


def _make_wav(path: pathlib.Path, duration_seconds: float = 2.0) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(44100)
        w.writeframes(b"\x00\x00" * int(duration_seconds * 44100))


@pytest.fixture(autouse=True)
async def _fresh_db(tmp_path, monkeypatch):
    """Each test gets its own isolated global DB with migrations applied."""
    db_path = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(db_path))
    await run_migrations(db_path)

    yield


async def _create_track(title: str = "TestTrack") -> int:
    """Insert a bare track row and return its id."""
    db_path = resolve_db_path()
    now = _dt.datetime.now(_dt.timezone.utc).isoformat()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "INSERT INTO track (title, license_type, created_at, updated_at) "
            "VALUES (?, 'lease_basic', ?, ?)",
            (title, now, now),
        ) as cur:
            track_id = cur.lastrowid
        await conn.commit()
    return track_id


@pytest.mark.asyncio
async def test_attach_returns_asset_with_sha256(tmp_path):
    track_id = await _create_track()
    audio = tmp_path / "beat.wav"
    _make_wav(audio)

    asset = await attach_asset(track_id, role="audio_tagged_mp3", path=audio)

    assert asset.id > 0
    assert asset.track_id == track_id
    assert asset.role == "audio_tagged_mp3"
    assert asset.mode == "linked"
    assert asset.abs_path == str(audio.resolve())
    assert asset.sha256 is not None
    assert len(asset.sha256) == 64
    assert asset.missing is False


@pytest.mark.asyncio
async def test_attach_audio_prefills_track_bpm_if_empty(tmp_path):
    """An audio file with TBPM=140 should set track.bpm to 140 if currently None."""
    track_id = await _create_track()
    audio = tmp_path / "beat.wav"
    _make_wav(audio)

    from beatos_core.assets import metadata as _meta_mod

    def fake_meta(_):
        return {"duration_seconds": 3.5, "sample_rate": 44100, "bpm": 140}

    original = _meta_mod.read_audio_metadata
    _meta_mod.read_audio_metadata = fake_meta
    try:
        await attach_asset(track_id, role="audio_tagged_mp3", path=audio)
    finally:
        _meta_mod.read_audio_metadata = original

    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT bpm FROM track WHERE id = ?", (track_id,)) as cur:
            row = await cur.fetchone()
    assert row is not None
    assert row[0] == 140


@pytest.mark.asyncio
async def test_detach_removes_asset_row(tmp_path):
    track_id = await _create_track()
    audio = tmp_path / "beat.wav"
    _make_wav(audio)
    asset = await attach_asset(track_id, role="audio_tagged_mp3", path=audio)

    await detach_asset(asset.id)

    assert await get_asset(asset.id) is None


@pytest.mark.asyncio
async def test_relocate_silent_when_sha256_matches(tmp_path):
    track_id = await _create_track()
    audio = tmp_path / "beat.wav"
    _make_wav(audio)
    asset = await attach_asset(track_id, role="audio_tagged_mp3", path=audio)

    new_loc = tmp_path / "renamed.wav"
    audio.rename(new_loc)

    relocated = await relocate_asset(asset.id, new_path=new_loc)

    assert relocated.abs_path == str(new_loc.resolve())
    assert relocated.missing is False


@pytest.mark.asyncio
async def test_relocate_raises_when_sha256_differs(tmp_path):
    track_id = await _create_track()
    audio = tmp_path / "beat.wav"
    _make_wav(audio, duration_seconds=2.0)
    asset = await attach_asset(track_id, role="audio_tagged_mp3", path=audio)

    different = tmp_path / "different.wav"
    _make_wav(different, duration_seconds=5.0)

    with pytest.raises(ValueError) as ei:
        await relocate_asset(asset.id, new_path=different)
    assert "sha256" in str(ei.value).lower()


@pytest.mark.asyncio
async def test_missing_sweep_marks_vanished_files(tmp_path):
    track_id = await _create_track()
    audio = tmp_path / "beat.wav"
    _make_wav(audio)
    asset = await attach_asset(track_id, role="audio_tagged_mp3", path=audio)
    audio.unlink()

    result = await missing_sweep()

    assert result["marked_missing"] == 1
    refreshed = await get_asset(asset.id)
    assert refreshed.missing is True


@pytest.mark.asyncio
async def test_attach_rejects_duplicate_without_replace(tmp_path):
    img1 = tmp_path / "a.jpg"
    img1.write_bytes(b"\x00" * 64)
    img2 = tmp_path / "b.jpg"
    img2.write_bytes(b"\x00" * 64)
    track_id = await _create_track()
    await attach_asset(track_id, "cover", img1)
    with pytest.raises(ValueError, match="already has"):
        await attach_asset(track_id, "cover", img2)


@pytest.mark.asyncio
async def test_attach_with_replace_swaps(tmp_path):
    img1 = tmp_path / "a.jpg"
    img1.write_bytes(b"\x00" * 64)
    img2 = tmp_path / "b.jpg"
    img2.write_bytes(b"\x00" * 64)
    track_id = await _create_track()
    first = await attach_asset(track_id, "cover", img1)
    second = await attach_asset(track_id, "cover", img2, replace=True)
    assets = await list_assets(track_id)
    assert len(assets) == 1
    assert assets[0].id == second.id
    assert assets[0].id != first.id
    assert str(img2) in assets[0].abs_path


@pytest.mark.asyncio
async def test_attach_accepts_path_outside_any_source(tmp_path):
    """v0.0.21.1 removed the OutOfSource guard. Files anywhere on disk attach
    successfully; Source membership is no longer a precondition."""
    import tempfile

    t_id = await _create_track("T")

    with tempfile.TemporaryDirectory() as rogue_dir:
        rogue = pathlib.Path(rogue_dir) / "outside.wav"
        rogue.write_bytes(b"\x00" * 64)

        asset = await attach_asset(t_id, "audio_tagged_mp3", rogue)
        assert asset.abs_path == str(rogue.resolve())


