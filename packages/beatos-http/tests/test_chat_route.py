"""POST /api/ai/chat route: gating + loop wiring."""
import pytest
from fastapi import HTTPException

from beatos_core.db import run_migrations
from beatos_core.tracks.service import create_track

from beatos_http.ai import service as ai_service
from beatos_http.ai.provider import ChatTurn, ToolUse
from beatos_http.routes.ai_chat import ChatRequest, chat


@pytest.fixture
def db(tmp_path, monkeypatch):
    p = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    return p


class _ScriptedProvider:
    def __init__(self, turns):
        self._turns = list(turns)
        self.calls = 0

    async def run_chat(self, *, messages, tools):
        turn = self._turns[self.calls]
        self.calls += 1
        return turn


@pytest.mark.asyncio
async def test_chat_409_when_ai_unconfigured(db, monkeypatch):
    await run_migrations(db)

    async def _none():
        return None

    monkeypatch.setattr(ai_service, "get_active_provider", _none)
    with pytest.raises(HTTPException) as ei:
        await chat(ChatRequest(message="hi"))
    assert ei.value.status_code == 409


@pytest.mark.asyncio
async def test_chat_runs_loop_and_returns_reply(db, monkeypatch):
    await run_migrations(db)
    await create_track("Midnight Drive")
    provider = _ScriptedProvider([
        ChatTurn(stop_reason="tool_use", text="searching",
                 tool_uses=[ToolUse(id="t1", name="search_tracks", input={"q": "Midnight"})]),
        ChatTurn(stop_reason="end_turn", text="Found 1 track."),
    ])

    async def _p():
        return provider

    monkeypatch.setattr(ai_service, "get_active_provider", _p)
    out = await chat(ChatRequest(message="find Midnight"))
    assert out["reply"] == "Found 1 track."
    assert out["tool_calls"][0]["name"] == "search_tracks"
    assert isinstance(out["messages"], list)


@pytest.mark.asyncio
async def test_chat_provider_error_becomes_502(db, monkeypatch):
    await run_migrations(db)

    class _Boom:
        async def run_chat(self, *, messages, tools):
            raise RuntimeError("AI provider request failed: HTTP 401")

    async def _p():
        return _Boom()

    monkeypatch.setattr(ai_service, "get_active_provider", _p)
    with pytest.raises(HTTPException) as ei:
        await chat(ChatRequest(message="hi"))
    assert ei.value.status_code == 502
    assert "HTTP 401" in str(ei.value.detail)
