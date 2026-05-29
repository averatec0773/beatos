import pytest

from beatos_core.db import run_migrations
from beatos_core.tracks.service import create_track, count_unanalyzed
from beatos_core.assets.service import attach_asset


@pytest.fixture(autouse=True)
async def _fresh_db(tmp_path, monkeypatch):
    db_path = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(db_path))
    await run_migrations(db_path)
    yield


@pytest.mark.asyncio
async def test_track_without_audio_not_counted():
    await create_track("no audio")
    assert await count_unanalyzed() == 0


@pytest.mark.asyncio
async def test_track_with_audio_and_no_bpm_counted(tmp_path):
    f = tmp_path / "beat.wav"
    f.write_bytes(b"RIFF....WAVE")
    t = await create_track("has audio")
    await attach_asset(t.id, "audio_untagged_wav", str(f))
    assert await count_unanalyzed() == 1
