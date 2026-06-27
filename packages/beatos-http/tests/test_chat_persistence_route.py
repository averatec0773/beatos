"""Chat routes persist to a conversation; confirm loads server-side state."""
import pytest

import beatos_http.handlers  # noqa: F401
from beatos_core.chat.service import get_conversation
from beatos_core.db import run_migrations
from beatos_core.tracks.service import create_track, list_tracks

from beatos_http.ai import service as ai_service
from beatos_http.ai.provider import ChatTurn, ToolUse
from beatos_http.routes.ai_chat import (
    ChatRequest,
    ConfirmRequest,
    chat,
    chat_confirm,
    delete_conversation_route,
    list_conversations_route,
)


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
async def test_chat_creates_conversation_and_persists(db, monkeypatch):
    await run_migrations(db)
    provider = _ScriptedProvider([ChatTurn(stop_reason="end_turn", text="Hi there.")])

    async def _p():
        return provider

    monkeypatch.setattr(ai_service, "get_active_provider", _p)
    out = await chat(ChatRequest(message="hello"))
    cid = out["conversation_id"]
    assert cid is not None
    conv = await get_conversation(cid)
    assert conv["messages"][0] == {"role": "user", "content": "hello"}
    assert conv["messages"][-1]["role"] == "assistant"


@pytest.mark.asyncio
async def test_second_turn_appends_to_same_conversation(db, monkeypatch):
    await run_migrations(db)
    provider = _ScriptedProvider([
        ChatTurn(stop_reason="end_turn", text="One."),
        ChatTurn(stop_reason="end_turn", text="Two."),
    ])

    async def _p():
        return provider

    monkeypatch.setattr(ai_service, "get_active_provider", _p)
    first = await chat(ChatRequest(message="first"))
    cid = first["conversation_id"]
    await chat(ChatRequest(message="second", conversation_id=cid))
    conv = await get_conversation(cid)
    user_msgs = [m for m in conv["messages"] if m["role"] == "user"]
    assert [m["content"] for m in user_msgs] == ["first", "second"]


@pytest.mark.asyncio
async def test_confirm_uses_server_state_and_persists(db, monkeypatch):
    await run_migrations(db)
    t = await create_track("Beat X")
    provider = _ScriptedProvider([
        ChatTurn(stop_reason="tool_use", text="",
                 tool_uses=[ToolUse(id="d1", name="trash_tracks", input={"ids": [t.id]})]),
        ChatTurn(stop_reason="end_turn", text="Trashed."),
    ])

    async def _p():
        return provider

    monkeypatch.setattr(ai_service, "get_active_provider", _p)
    first = await chat(ChatRequest(message="trash Beat X"))
    cid = first["conversation_id"]
    assert first["pending_confirm"] is not None
    out = await chat_confirm(ConfirmRequest(conversation_id=cid, approve=True))
    assert out["reply"] == "Trashed."
    assert not any(x.id == t.id for x in await list_tracks())


@pytest.mark.asyncio
async def test_list_and_delete_conversation(db, monkeypatch):
    await run_migrations(db)
    provider = _ScriptedProvider([ChatTurn(stop_reason="end_turn", text="Hi.")])

    async def _p():
        return provider

    monkeypatch.setattr(ai_service, "get_active_provider", _p)
    out = await chat(ChatRequest(message="hello"))
    cid = out["conversation_id"]
    listing = await list_conversations_route()
    assert any(c["id"] == cid for c in listing["conversations"])
    deleted = await delete_conversation_route(cid)
    assert deleted["deleted"] is True
    listing2 = await list_conversations_route()
    assert not any(c["id"] == cid for c in listing2["conversations"])
