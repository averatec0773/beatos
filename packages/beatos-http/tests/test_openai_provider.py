"""OpenAI-compatible provider (ChatGPT + DeepSeek): message/tool translation,
run_chat parsing, suggest_tags, and vision gating."""
import httpx
import pytest

from beatos_http.ai.openai_provider import (
    OpenAICompatibleProvider,
    _to_openai_messages,
    _to_openai_tools,
)


def test_to_openai_messages_translates_blocks():
    history = [
        {"role": "user", "content": "find trap"},
        {
            "role": "assistant",
            "content": [
                {"type": "text", "text": "Searching."},
                {"type": "tool_use", "id": "call_1", "name": "search_tracks", "input": {"q": "trap"}},
            ],
        },
        {
            "role": "user",
            "content": [
                {"type": "tool_result", "tool_use_id": "call_1", "content": "[]"},
            ],
        },
    ]
    out = _to_openai_messages(history)
    assert out[0]["role"] == "system"  # shared system prompt prepended
    assert out[1] == {"role": "user", "content": "find trap"}
    asst = out[2]
    assert asst["role"] == "assistant"
    assert asst["content"] == "Searching."
    assert asst["tool_calls"][0]["id"] == "call_1"
    assert asst["tool_calls"][0]["function"]["name"] == "search_tracks"
    assert asst["tool_calls"][0]["function"]["arguments"] == '{"q": "trap"}'
    tool_msg = out[3]
    assert tool_msg == {"role": "tool", "tool_call_id": "call_1", "content": "[]"}


def test_to_openai_tools_shape():
    tools = [{"name": "get_track", "description": "x", "input_schema": {"type": "object"}}]
    out = _to_openai_tools(tools)
    assert out[0]["type"] == "function"
    assert out[0]["function"]["name"] == "get_track"
    assert out[0]["function"]["parameters"] == {"type": "object"}


class _Resp:
    def __init__(self, payload):
        self._payload = payload

    status_code = 200

    def raise_for_status(self) -> None:
        pass

    def json(self) -> dict:
        return self._payload


class _FakeClient:
    last: dict = {}
    payload: dict = {}

    def __init__(self, *a, **k) -> None:
        pass

    async def __aenter__(self) -> "_FakeClient":
        return self

    async def __aexit__(self, *a) -> bool:
        return False

    async def post(self, url, headers=None, json=None):
        _FakeClient.last = {"url": url, "headers": headers, "json": json}
        return _Resp(_FakeClient.payload)


@pytest.mark.asyncio
async def test_run_chat_parses_tool_calls(monkeypatch):
    _FakeClient.payload = {
        "choices": [
            {
                "finish_reason": "tool_calls",
                "message": {
                    "content": "Let me look.",
                    "tool_calls": [
                        {
                            "id": "call_9",
                            "type": "function",
                            "function": {"name": "search_tracks", "arguments": '{"q": "lofi"}'},
                        }
                    ],
                },
            }
        ]
    }
    monkeypatch.setattr(httpx, "AsyncClient", _FakeClient)
    p = OpenAICompatibleProvider(
        name="openai",
        api_key="sk-secret",
        model="gpt-4o-mini",
        base_url="https://api.openai.com/v1",
        supports_vision=True,
    )
    turn = await p.run_chat(
        messages=[{"role": "user", "content": "find lofi"}],
        tools=[{"name": "search_tracks", "description": "x", "input_schema": {"type": "object"}}],
    )
    assert turn.stop_reason == "tool_use"  # normalised from "tool_calls"
    assert turn.text == "Let me look."
    assert turn.tool_uses[0].id == "call_9"
    assert turn.tool_uses[0].name == "search_tracks"
    assert turn.tool_uses[0].input == {"q": "lofi"}
    # Bearer auth + chat-completions URL + translated tool def.
    assert _FakeClient.last["headers"]["authorization"] == "Bearer sk-secret"
    assert _FakeClient.last["url"] == "https://api.openai.com/v1/chat/completions"
    assert _FakeClient.last["json"]["tools"][0]["function"]["name"] == "search_tracks"


@pytest.mark.asyncio
async def test_run_chat_plain_reply(monkeypatch):
    _FakeClient.payload = {
        "choices": [{"finish_reason": "stop", "message": {"content": "Hello."}}]
    }
    monkeypatch.setattr(httpx, "AsyncClient", _FakeClient)
    p = OpenAICompatibleProvider(
        name="deepseek",
        api_key="sk-x",
        model="deepseek-chat",
        base_url="https://api.deepseek.com/v1",
        supports_vision=False,
    )
    turn = await p.run_chat(messages=[{"role": "user", "content": "hi"}], tools=[])
    assert turn.stop_reason == "stop"
    assert turn.text == "Hello."
    assert turn.tool_uses == []
    assert "tools" not in _FakeClient.last["json"]


@pytest.mark.asyncio
async def test_suggest_tags_vision_gating(monkeypatch):
    _FakeClient.payload = {
        "choices": [
            {"message": {"content": '{"genre":["Trap"],"mood":["Dark"],"tags":["808"]}'}}
        ]
    }
    monkeypatch.setattr(httpx, "AsyncClient", _FakeClient)
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16

    # Vision provider includes the image block.
    vis = OpenAICompatibleProvider(
        name="openai", api_key="k", model="gpt-4o", base_url="https://x/v1", supports_vision=True
    )
    res = await vis.suggest_tags(title="Night", cover_png=png, existing={"genre": ["Trap"]})
    assert res.genre == ["Trap"]
    kinds = {b["type"] for b in _FakeClient.last["json"]["messages"][0]["content"]}
    assert "image_url" in kinds and "text" in kinds

    # Non-vision provider (DeepSeek) drops the image: content is a plain string.
    nv = OpenAICompatibleProvider(
        name="deepseek", api_key="k", model="deepseek-chat", base_url="https://x/v1", supports_vision=False
    )
    await nv.suggest_tags(title="Night", cover_png=png, existing={})
    assert isinstance(_FakeClient.last["json"]["messages"][0]["content"], str)
