import datetime as dt

import aiosqlite
import pytest

from beatos_core.db import run_migrations
from beatos_core.audio_analysis.models import AudioAnalysisResult
import beatos_http.routes.batch_analysis as batch


@pytest.fixture
async def db_path(tmp_path, monkeypatch):
    p = tmp_path / "t.db"
    await run_migrations(p)
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(p) as conn:
        await conn.execute(
            "INSERT INTO track (id, title, created_at, updated_at) VALUES (1, 'A', ?, ?)",
            (now, now),
        )
        await conn.execute(
            "INSERT INTO asset (track_id, role, abs_path, missing, created_at, updated_at) "
            "VALUES (1, 'audio_untagged_wav', '/tmp/a.wav', 0, ?, ?)",
            (now, now),
        )
        await conn.commit()
    return p


@pytest.mark.asyncio
async def test_run_job_autofills_high_confidence(db_path, monkeypatch):
    async def fake_analyze(asset_id):
        return AudioAnalysisResult(
            asset_id=asset_id, sha256="x", bpm=140, bpm_confidence=0.9,
            key="C minor", key_confidence=0.8, duration_seconds=120.0,
            analyzed_at=dt.datetime.now(dt.timezone.utc),
        )

    monkeypatch.setattr(batch, "analyze_asset", fake_analyze)
    job_id = batch._new_job([1])
    await batch._run_job(job_id, [1])

    job = batch._JOBS[job_id]
    assert job["status"] == "done"
    assert job["done"] == 1
    assert job["filled_bpm"] == 1
    assert job["filled_key"] == 1

    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT bpm, key_signature FROM track WHERE id=1") as c:
            row = await c.fetchone()
    assert row == (140, "C minor")


@pytest.mark.asyncio
async def test_run_job_skips_low_confidence(db_path, monkeypatch):
    async def fake_analyze(asset_id):
        return AudioAnalysisResult(
            asset_id=asset_id, sha256="x", bpm=140, bpm_confidence=0.3,
            key=None, key_confidence=0.0, duration_seconds=120.0,
            analyzed_at=dt.datetime.now(dt.timezone.utc),
        )

    monkeypatch.setattr(batch, "analyze_asset", fake_analyze)
    job_id = batch._new_job([1])
    await batch._run_job(job_id, [1])

    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT bpm FROM track WHERE id=1") as c:
            (bpm,) = await c.fetchone()
    assert bpm is None
    assert batch._JOBS[job_id]["filled_bpm"] == 0
