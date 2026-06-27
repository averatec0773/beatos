"""POST /api/ai/chat + /confirm: pending_confirm surfaced, confirm applies."""
import pytest

import beatos_http.handlers  # noqa: F401
from beatos_core.db import run_migrations
from beatos_core.tracks.service import create_track, list_tracks

from beatos_http.ai import service as ai_service
from beatos_http.ai.provider import ChatTurn, ToolUse
from beatos_http.routes.ai_chat import ChatRequest, ConfirmRequest, chat, chat_confirm


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
async def test_chat_returns_pending_confirm(db, monkeypatch):
    await run_migrations(db)
    t = await create_track("Beat A")
    provider = _ScriptedProvider([
        ChatTurn(stop_reason="tool_use", text="I'll trash it.",
                 tool_uses=[ToolUse(id="d1", name="trash_tracks", input={"ids": [t.id]})]),
    ])

    async def _p():
        return provider

    monkeypatch.setattr(ai_service, "get_active_provider", _p)
    out = await chat(ChatRequest(message="trash Beat A"))
    assert out["pending_confirm"]["tool_uses"][0]["name"] == "trash_tracks"
    assert any(x.id == t.id for x in await list_tracks())


@pytest.mark.asyncio
async def test_confirm_approve_applies(db, monkeypatch):
    await run_migrations(db)
    t = await create_track("Beat B")
    provider = _ScriptedProvider([
        ChatTurn(stop_reason="tool_use", text="",
                 tool_uses=[ToolUse(id="d1", name="trash_tracks", input={"ids": [t.id]})]),
        ChatTurn(stop_reason="end_turn", text="Trashed."),
    ])

    async def _p():
        return provider

    monkeypatch.setattr(ai_service, "get_active_provider", _p)
    first = await chat(ChatRequest(message="trash Beat B"))
    out = await chat_confirm(ConfirmRequest(
        messages=first["messages"],
        tool_uses=first["pending_confirm"]["tool_uses"],
        approve=True,
    ))
    assert out["reply"] == "Trashed."
    assert not any(x.id == t.id for x in await list_tracks())
