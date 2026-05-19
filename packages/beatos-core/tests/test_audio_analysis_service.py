"""Tests for analyze_asset service (Phase 2)."""
import datetime as _dt
import pathlib
import shutil
from unittest.mock import patch, MagicMock

import aiosqlite
import pytest

from beatos_core.assets.service import attach_asset
from beatos_core.audio_analysis.service import analyze_asset
from beatos_core.db import resolve_db_path, run_migrations

FIXTURE_WAV = pathlib.Path(__file__).parent / "fixtures" / "click_120bpm_c_major.wav"


@pytest.fixture(autouse=True)
async def _fresh_db(tmp_path, monkeypatch):
    db_path = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(db_path))
    await run_migrations(db_path)
    yield


async def _create_track(title: str = "TestTrack") -> int:
    import datetime as _dt2
    db_path = resolve_db_path()
    now = _dt2.datetime.now(_dt2.timezone.utc).isoformat()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "INSERT INTO track (title, license_type, created_at, updated_at) "
            "VALUES (?, 'lease_basic', ?, ?)",
            (title, now, now),
        ) as cur:
            track_id = cur.lastrowid
        await conn.commit()
    return track_id


async def _attach_fixture(tmp_path: pathlib.Path, track_id: int) -> int:
    """Copy the fixture WAV into tmp_path (source root) and attach it."""
    dest = tmp_path / "click_120bpm_c_major.wav"
    shutil.copy(FIXTURE_WAV, dest)
    asset = await attach_asset(track_id, role="audio_tagged_wav", path=dest)
    return asset.id


async def test_analyze_asset_returns_result(tmp_path):
    track_id = await _create_track()
    asset_id = await _attach_fixture(tmp_path, track_id)

    result = await analyze_asset(asset_id)

    assert result.asset_id == asset_id
    assert result.sha256
    assert result.bpm is not None
    assert result.key is not None
    assert result.duration_seconds is not None
    assert result.analyzed_at is not None


async def test_analyze_asset_caches_result(tmp_path):
    """Second call uses cache — pipeline.analyze should be called only once."""
    track_id = await _create_track()
    asset_id = await _attach_fixture(tmp_path, track_id)

    with patch("beatos_core.audio_analysis.service.analyze") as mock_analyze:
        from beatos_core.audio_analysis.models import AnalysisRaw
        mock_analyze.return_value = AnalysisRaw(
            bpm=120.0, bpm_confidence=0.9, key="C major", key_confidence=0.8,
            duration_seconds=4.0,
        )

        first = await analyze_asset(asset_id)
        second = await analyze_asset(asset_id)

    mock_analyze.assert_called_once()
    assert first.bpm == second.bpm
    assert first.key == second.key


async def test_analyze_asset_reruns_when_sha256_changes(tmp_path):
    """After sha256 update, cache miss → pipeline runs again."""
    track_id = await _create_track()
    asset_id = await _attach_fixture(tmp_path, track_id)

    with patch("beatos_core.audio_analysis.service.analyze") as mock_analyze:
        from beatos_core.audio_analysis.models import AnalysisRaw
        mock_analyze.return_value = AnalysisRaw(
            bpm=120.0, bpm_confidence=0.9, key="C major", key_confidence=0.8,
            duration_seconds=4.0,
        )

        await analyze_asset(asset_id)

        # Simulate file replacement by changing the sha256 in the asset row.
        db_path = resolve_db_path()
        async with aiosqlite.connect(db_path) as conn:
            await conn.execute(
                "UPDATE asset SET sha256 = ? WHERE id = ?",
                ("deadbeef" * 8, asset_id),
            )
            await conn.commit()

        await analyze_asset(asset_id)

    assert mock_analyze.call_count == 2


async def test_analyze_asset_raises_for_nonexistent_asset_id(tmp_path):
    with pytest.raises(FileNotFoundError, match="not found"):
        await analyze_asset(99999)


async def test_analyze_asset_raises_for_non_audio_role(tmp_path):
    track_id = await _create_track()
    cover = tmp_path / "cover.jpg"
    cover.write_bytes(b"\xff\xd8\xff" + b"\x00" * 64)
    asset = await attach_asset(track_id, role="cover", path=cover)

    with pytest.raises(ValueError, match="not audio"):
        await analyze_asset(asset.id)


async def test_analyze_asset_raises_when_file_missing(tmp_path):
    track_id = await _create_track()
    asset_id = await _attach_fixture(tmp_path, track_id)

    # Remove the actual file from disk after attach.
    dest = tmp_path / "click_120bpm_c_major.wav"
    dest.unlink()

    with pytest.raises(FileNotFoundError, match="missing"):
        await analyze_asset(asset_id)
