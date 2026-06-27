"""The in-app chat loop: execute tool_use, feed results back, terminate."""
import pytest

from beatos_core.db import run_migrations
from beatos_core.tracks.service import create_track

from beatos_http.ai.provider import ChatTurn, ToolUse
from beatos_http.ai.chat_service import run_chat_turn


@pytest.fixture
def db(tmp_path, monkeypatch):
    p = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    return p


class _ScriptedProvider:
    """Returns pre-baked ChatTurns in order; records call count."""

    def __init__(self, turns):
        self._turns = list(turns)
        self.calls = 0

    async def run_chat(self, *, messages, tools):
        turn = self._turns[self.calls]
        self.calls += 1
        return turn


@pytest.mark.asyncio
async def test_loop_executes_tool_then_finishes(db):
    await run_migrations(db)
    await create_track("Midnight Drive")
    provider = _ScriptedProvider([
        ChatTurn(stop_reason="tool_use", text="searching",
                 tool_uses=[ToolUse(id="t1", name="search_tracks", input={"q": "Midnight"})]),
        ChatTurn(stop_reason="end_turn", text="Found 1 track."),
    ])
    res = await run_chat_turn(provider, history=[], user_message="find Midnight")
    assert res.reply_text == "Found 1 track."
    assert res.tool_calls[0]["name"] == "search_tracks"
    assert isinstance(res.tool_calls[0]["result"], list)
    assert provider.calls == 2


@pytest.mark.asyncio
async def test_tool_error_is_captured_not_raised(db):
    await run_migrations(db)
    provider = _ScriptedProvider([
        ChatTurn(stop_reason="tool_use", text="",
                 tool_uses=[ToolUse(id="t1", name="list_distinct_values", input={"field": "not_a_field"})]),
        ChatTurn(stop_reason="end_turn", text="That field does not exist."),
    ])
    res = await run_chat_turn(provider, history=[], user_message="x")
    assert "error" in res.tool_calls[0]
    assert res.reply_text == "That field does not exist."


@pytest.mark.asyncio
async def test_loop_caps_iterations(db):
    await run_migrations(db)
    loop_turn = ChatTurn(stop_reason="tool_use", text="x",
                         tool_uses=[ToolUse(id="t", name="list_distinct_values", input={"field": "genre"})])
    provider = _ScriptedProvider([loop_turn] * 20)
    res = await run_chat_turn(provider, history=[], user_message="loop")
    assert provider.calls == 8  # _MAX_TOOL_ITERS
