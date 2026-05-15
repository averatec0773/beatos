"""Tests for asset attach / detach / relocate / missing_sweep."""
import pathlib
import wave

import pytest

from beatos_core import state
from beatos_core.assets.service import (
    attach_asset,
    detach_asset,
    get_asset,
    list_assets_for_track,
    missing_sweep,
    relocate_asset,
)
from beatos_core.library.service import init_library_root
from beatos_core.tracks.service import create_track


def _make_wav(path: pathlib.Path, duration_seconds: float = 2.0) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(44100)
        w.writeframes(b"\x00\x00" * int(duration_seconds * 44100))


@pytest.fixture(autouse=True)
async def _fresh(tmp_path, monkeypatch):
    monkeypatch.setenv("BEATOS_REGISTRY_PATH", str(tmp_path / "known_libraries.json"))
    await state.set_active(None)
    yield
    await state.set_active(None)


async def _setup_library_and_track(tmp_path):
    root = tmp_path / "MyLib"
    root.mkdir()
    await init_library_root(root)
    return await create_track("MyBeat")


@pytest.mark.asyncio
async def test_attach_returns_asset_with_sha256(tmp_path):
    track = await _setup_library_and_track(tmp_path)
    audio = tmp_path / "beat.wav"
    _make_wav(audio)

    asset = await attach_asset(track.id, role="audio", path=audio)

    assert asset.id > 0
    assert asset.track_id == track.id
    assert asset.role == "audio"
    assert asset.mode == "linked"
    assert asset.abs_path == str(audio.resolve())
    assert asset.sha256 is not None
    assert len(asset.sha256) == 64  # hex digits
    assert asset.missing is False


@pytest.mark.asyncio
async def test_attach_audio_prefills_track_bpm_if_empty(tmp_path):
    """An MP3 with TBPM=140 should set track.bpm to 140 if currently None."""
    # We can't easily generate an MP3 with TBPM in a test, so we monkeypatch
    # the metadata reader instead.
    track = await _setup_library_and_track(tmp_path)
    audio = tmp_path / "beat.wav"
    _make_wav(audio)

    from beatos_core.assets import metadata as _meta_mod

    def fake_meta(_):
        return {"duration_seconds": 3.5, "sample_rate": 44100, "bpm": 140}

    original = _meta_mod.read_audio_metadata
    _meta_mod.read_audio_metadata = fake_meta
    try:
        await attach_asset(track.id, role="audio", path=audio)
    finally:
        _meta_mod.read_audio_metadata = original

    from beatos_core.tracks.service import get_track
    refreshed = await get_track(track.id)
    assert refreshed.bpm == 140


@pytest.mark.asyncio
async def test_detach_removes_asset_row(tmp_path):
    track = await _setup_library_and_track(tmp_path)
    audio = tmp_path / "beat.wav"
    _make_wav(audio)
    asset = await attach_asset(track.id, role="audio", path=audio)

    await detach_asset(asset.id)

    assert await get_asset(asset.id) is None


@pytest.mark.asyncio
async def test_relocate_silent_when_sha256_matches(tmp_path):
    track = await _setup_library_and_track(tmp_path)
    audio = tmp_path / "beat.wav"
    _make_wav(audio)
    asset = await attach_asset(track.id, role="audio", path=audio)

    # Move the file but keep its content
    new_loc = tmp_path / "renamed.wav"
    audio.rename(new_loc)

    relocated = await relocate_asset(asset.id, new_path=new_loc)

    assert relocated.abs_path == str(new_loc.resolve())
    assert relocated.missing is False


@pytest.mark.asyncio
async def test_relocate_raises_when_sha256_differs(tmp_path):
    track = await _setup_library_and_track(tmp_path)
    audio = tmp_path / "beat.wav"
    _make_wav(audio, duration_seconds=2.0)
    asset = await attach_asset(track.id, role="audio", path=audio)

    different = tmp_path / "different.wav"
    _make_wav(different, duration_seconds=5.0)

    with pytest.raises(ValueError) as ei:
        await relocate_asset(asset.id, new_path=different)
    assert "sha256" in str(ei.value).lower()


@pytest.mark.asyncio
async def test_missing_sweep_marks_vanished_files(tmp_path):
    track = await _setup_library_and_track(tmp_path)
    audio = tmp_path / "beat.wav"
    _make_wav(audio)
    asset = await attach_asset(track.id, role="audio", path=audio)
    audio.unlink()

    result = await missing_sweep()

    assert result["marked_missing"] == 1
    refreshed = await get_asset(asset.id)
    assert refreshed.missing is True
