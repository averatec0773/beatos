"""Anthropic provider run_chat: parses text + tool_use from a Messages reply."""
import httpx
import pytest

from beatos_http.ai.anthropic_provider import AnthropicProvider


class _ToolResp:
    status_code = 200

    def raise_for_status(self) -> None:
        pass

    def json(self) -> dict:
        return {
            "stop_reason": "tool_use",
            "content": [
                {"type": "text", "text": "Let me search."},
                {"type": "tool_use", "id": "tu_1", "name": "search_tracks", "input": {"q": "trap"}},
            ],
        }


class _FakeClient:
    last: dict = {}

    def __init__(self, *a, **k) -> None:
        pass

    async def __aenter__(self) -> "_FakeClient":
        return self

    async def __aexit__(self, *a) -> bool:
        return False

    async def post(self, url, headers=None, json=None):
        _FakeClient.last = {"url": url, "headers": headers, "json": json}
        return _ToolResp()


@pytest.mark.asyncio
async def test_run_chat_parses_text_and_tool_use(monkeypatch):
    monkeypatch.setattr(httpx, "AsyncClient", _FakeClient)
    p = AnthropicProvider(api_key="sk-secret", model="claude-haiku-4-5")
    turn = await p.run_chat(
        messages=[{"role": "user", "content": "find trap"}],
        tools=[{"name": "search_tracks", "description": "x", "input_schema": {"type": "object"}}],
    )
    assert turn.stop_reason == "tool_use"
    assert turn.text == "Let me search."
    assert len(turn.tool_uses) == 1
    assert turn.tool_uses[0].id == "tu_1"
    assert turn.tool_uses[0].name == "search_tracks"
    assert turn.tool_uses[0].input == {"q": "trap"}
    assert _FakeClient.last["json"]["tools"][0]["name"] == "search_tracks"
    assert _FakeClient.last["json"]["messages"][0]["content"] == "find trap"
