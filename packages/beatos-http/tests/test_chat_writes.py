"""Chat loop writes: auto-apply non-destructive, pause+confirm destructive."""
import pytest

import beatos_http.handlers  # noqa: F401 — registers apply handlers
from beatos_core.app_settings.service import set_setting
from beatos_core.db import run_migrations
from beatos_core.tracks.service import create_track, get_track, list_tracks

from beatos_http.ai.provider import ChatTurn, ToolUse
from beatos_http.ai.chat_service import resume_chat_turn, run_chat_turn


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
async def test_nondestructive_write_auto_applies(db):
    await run_migrations(db)
    t = await create_track("Beat A")
    provider = _ScriptedProvider([
        ChatTurn(stop_reason="tool_use", text="tagging",
                 tool_uses=[ToolUse(id="w1", name="update_tracks",
                                    input={"ids": [t.id], "patch": {"genre": ["Trap"]}})]),
        ChatTurn(stop_reason="end_turn", text="Tagged."),
    ])
    res = await run_chat_turn(provider, history=[], user_message="tag Beat A as Trap")
    assert res.pending_confirm is None
    assert res.reply_text == "Tagged."
    assert (await get_track(t.id)).genre == ["Trap"]


@pytest.mark.asyncio
async def test_destructive_write_pauses_without_applying(db):
    await run_migrations(db)
    t = await create_track("Beat B")
    provider = _ScriptedProvider([
        ChatTurn(stop_reason="tool_use", text="I'll trash it.",
                 tool_uses=[ToolUse(id="d1", name="trash_tracks", input={"ids": [t.id]})]),
    ])
    res = await run_chat_turn(provider, history=[], user_message="trash Beat B")
    assert res.pending_confirm is not None
    assert res.pending_confirm["tool_uses"][0]["name"] == "trash_tracks"
    assert res.pending_confirm["summary"]
    assert any(x.id == t.id for x in await list_tracks())
    assert provider.calls == 1


@pytest.mark.asyncio
async def test_resume_approve_applies_and_continues(db):
    await run_migrations(db)
    t = await create_track("Beat C")
    pause = ChatTurn(stop_reason="tool_use", text="",
                     tool_uses=[ToolUse(id="d1", name="trash_tracks", input={"ids": [t.id]})])
    provider = _ScriptedProvider([pause, ChatTurn(stop_reason="end_turn", text="Trashed.")])
    first = await run_chat_turn(provider, history=[], user_message="trash Beat C")
    res = await resume_chat_turn(
        provider, messages=first.messages,
        tool_uses=first.pending_confirm["tool_uses"], approve=True,
    )
    assert res.reply_text == "Trashed."
    assert not any(x.id == t.id for x in await list_tracks())


@pytest.mark.asyncio
async def test_resume_decline_does_not_apply(db):
    await run_migrations(db)
    t = await create_track("Beat D")
    pause = ChatTurn(stop_reason="tool_use", text="",
                     tool_uses=[ToolUse(id="d1", name="trash_tracks", input={"ids": [t.id]})])
    provider = _ScriptedProvider([pause, ChatTurn(stop_reason="end_turn", text="Okay, kept it.")])
    first = await run_chat_turn(provider, history=[], user_message="trash Beat D")
    res = await resume_chat_turn(
        provider, messages=first.messages,
        tool_uses=first.pending_confirm["tool_uses"], approve=False,
    )
    assert res.reply_text == "Okay, kept it."
    assert any(x.id == t.id for x in await list_tracks())


@pytest.mark.asyncio
async def test_read_only_refuses_write(db):
    await run_migrations(db)
    t = await create_track("Beat E")
    await set_setting("agent_permission_mode", "read_only")
    provider = _ScriptedProvider([
        ChatTurn(stop_reason="tool_use", text="",
                 tool_uses=[ToolUse(id="w1", name="update_tracks",
                                    input={"ids": [t.id], "patch": {"genre": ["Trap"]}})]),
        ChatTurn(stop_reason="end_turn", text="Writes are disabled."),
    ])
    res = await run_chat_turn(provider, history=[], user_message="tag it")
    assert res.pending_confirm is None
    assert "error" in res.tool_calls[0]
    assert (await get_track(t.id)).genre != ["Trap"]
