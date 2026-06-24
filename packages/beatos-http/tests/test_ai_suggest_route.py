"""EPIC-D4c-2: POST /api/tracks/{id}/suggest-tags route."""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from beatos_core.assets.service import attach_asset
from beatos_core.db import run_migrations
from beatos_core.tracks.service import create_track, update_track

from beatos_http.ai import service as ai_service
from beatos_http.ai.provider import TagSuggestion
from beatos_http.routes.ai import suggest_tags


@pytest.fixture
def db(tmp_path, monkeypatch):
    p = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    return p


class _FakeProvider:
    name = "anthropic"

    def __init__(self) -> None:
        self.called_with: dict | None = None

    async def suggest_tags(self, *, title, cover_png, existing) -> TagSuggestion:
        self.called_with = {"title": title, "cover_png": cover_png, "existing": existing}
        return TagSuggestion(genre=["Trap"], mood=["Dark"], tags=["808"], description="x")


async def test_track_not_found_404(db):
    await run_migrations(db)
    with pytest.raises(HTTPException) as ei:
        await suggest_tags(99999)
    assert ei.value.status_code == 404


async def test_ai_disabled_returns_409(db, monkeypatch):
    await run_migrations(db)
    t = await create_track("T1")

    async def _none():
        return None

    monkeypatch.setattr(ai_service, "get_active_provider", _none)
    with pytest.raises(HTTPException) as ei:
        await suggest_tags(t.id)
    assert ei.value.status_code == 409


async def test_suggest_sends_cover_title_existing_and_returns(db, tmp_path, monkeypatch):
    await run_migrations(db)
    t = await create_track("Midnight Drive")
    await update_track(t.id, {"genre": ["Trap"], "mood": ["Dark"], "tags": ["808"]})
    cover = tmp_path / "cover.png"
    cover.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 32)
    await attach_asset(t.id, "cover", cover)

    fake = _FakeProvider()

    async def _fake():
        return fake

    monkeypatch.setattr(ai_service, "get_active_provider", _fake)

    result = await suggest_tags(t.id)
    assert result.genre == ["Trap"] and result.tags == ["808"]
    assert fake.called_with is not None
    assert fake.called_with["title"] == "Midnight Drive"
    assert fake.called_with["cover_png"] is not None  # cover bytes loaded + forwarded
    assert fake.called_with["existing"]["genre"] == ["Trap"]


async def test_provider_runtime_error_becomes_502(db, monkeypatch):
    await run_migrations(db)
    t = await create_track("T2")

    class _Boom:
        name = "anthropic"

        async def suggest_tags(self, **_):
            raise RuntimeError("AI provider request failed: HTTP 401")

    async def _boom():
        return _Boom()

    monkeypatch.setattr(ai_service, "get_active_provider", _boom)
    with pytest.raises(HTTPException) as ei:
        await suggest_tags(t.id)
    assert ei.value.status_code == 502
    assert "HTTP 401" in str(ei.value.detail)
