"""EPIC-D4d: batch AI tagging job (auto-apply to empty fields only)."""
from __future__ import annotations

import pytest

from beatos_core.db import run_migrations
from beatos_core.tracks.service import create_track, get_track, update_track

from beatos_http.ai import service as ai_service
from beatos_http.ai.provider import TagSuggestion
from beatos_http.routes import batch_tagging


@pytest.fixture
def db(tmp_path, monkeypatch):
    p = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    return p


class _FakeProvider:
    name = "anthropic"

    async def suggest_tags(self, *, title, cover_png, existing) -> TagSuggestion:
        return TagSuggestion(genre=["Trap"], mood=["Dark"], tags=["808"], description="Auto.")


async def test_start_requires_ai_enabled(db, monkeypatch):
    await run_migrations(db)

    async def _none():
        return None

    monkeypatch.setattr(ai_service, "get_active_provider", _none)
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as ei:
        await batch_tagging.start_batch(batch_tagging._BatchRequest(ids=[1]))
    assert ei.value.status_code == 409


async def test_run_job_fills_only_empty_fields(db):
    await run_migrations(db)
    t1 = await create_track("Empty One")  # no tags → should get filled
    t2 = await create_track("Has Genre")
    await update_track(t2.id, {"genre": ["House"]})  # genre set → must NOT be overwritten

    job_id = batch_tagging._new_job([t1.id, t2.id])
    await batch_tagging._run_job(job_id, [t1.id, t2.id], _FakeProvider())

    job = batch_tagging._JOBS[job_id]
    assert job["status"] == "done"
    assert job["done"] == 2
    assert job["applied"] == 2  # both had at least one empty field
    assert job["errors"] == 0

    a = await get_track(t1.id)
    assert a.genre == ["Trap"] and a.mood == ["Dark"] and a.tags == ["808"]
    b = await get_track(t2.id)
    assert b.genre == ["House"]  # preserved, not overwritten
    assert b.mood == ["Dark"]  # empty field got filled


async def test_run_job_isolates_per_track_errors(db):
    await run_migrations(db)
    t1 = await create_track("Boom")

    class _Boom:
        name = "anthropic"

        async def suggest_tags(self, **_):
            raise RuntimeError("provider exploded")

    job_id = batch_tagging._new_job([t1.id])
    await batch_tagging._run_job(job_id, [t1.id], _Boom())
    job = batch_tagging._JOBS[job_id]
    assert job["status"] == "done"
    assert job["errors"] == 1
    assert "provider exploded" in job["error_details"][0]
