"""OpenAI-compatible cloud provider (ChatGPT + DeepSeek).

DeepSeek's API is OpenAI-compatible, so one client drives both — they differ only
in base URL, model ids, and whether the model accepts images. The rest of the app
speaks an Anthropic-shaped message/tool format (content blocks: text / tool_use /
tool_result), so this provider translates that to the OpenAI chat-completions
schema on the way out and back to the provider-neutral ChatTurn / TagSuggestion on
the way in.

Privacy mirrors the Anthropic provider: suggest_tags forwards only the cover image
(when the model supports vision), the title, and existing genre/mood/tags — never
audio, paths, or other library data. The API key is sent as a Bearer header and is
NEVER logged (no key in any log line or re-raised error).
"""
from __future__ import annotations

import base64
import json
import logging

import httpx

# Reuse the shared prompt + parsing so all cloud providers behave identically.
from beatos_http.ai.anthropic_provider import (
    _CHAT_SYSTEM,
    _PROMPT,
    _media_type,
    _parse_suggestion,
)
from beatos_http.ai.provider import ChatTurn, TagSuggestion, ToolUse

log = logging.getLogger(__name__)

_MAX_TOKENS = 600
_CHAT_MAX_TOKENS = 1024
_TIMEOUT = 30.0


def _to_openai_tools(tools: list[dict]) -> list[dict]:
    """Anthropic tool defs (name/description/input_schema) → OpenAI function tools."""
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t.get("description", ""),
                "parameters": t.get("input_schema") or {"type": "object", "properties": {}},
            },
        }
        for t in tools
    ]


def _to_openai_messages(messages: list[dict]) -> list[dict]:
    """Anthropic message history → OpenAI messages, with the shared system prompt
    prepended. Assistant tool_use blocks become `tool_calls`; user tool_result
    blocks become standalone `role:"tool"` messages keyed by tool_call_id."""
    out: list[dict] = [{"role": "system", "content": _CHAT_SYSTEM}]
    for m in messages:
        role = m.get("role")
        content = m.get("content")
        if isinstance(content, str):
            out.append({"role": role, "content": content})
            continue
        blocks = content if isinstance(content, list) else []
        if role == "assistant":
            text_parts: list[str] = []
            tool_calls: list[dict] = []
            for b in blocks:
                if not isinstance(b, dict):
                    continue
                if b.get("type") == "text":
                    text_parts.append(b.get("text", ""))
                elif b.get("type") == "tool_use":
                    tool_calls.append(
                        {
                            "id": b.get("id", ""),
                            "type": "function",
                            "function": {
                                "name": b.get("name", ""),
                                "arguments": json.dumps(b.get("input") or {}, ensure_ascii=False),
                            },
                        }
                    )
            msg: dict = {"role": "assistant", "content": "".join(text_parts) or None}
            if tool_calls:
                msg["tool_calls"] = tool_calls
            out.append(msg)
        else:  # user turn carrying tool results (and/or plain text)
            text_parts = []
            for b in blocks:
                if not isinstance(b, dict):
                    continue
                if b.get("type") == "tool_result":
                    out.append(
                        {
                            "role": "tool",
                            "tool_call_id": b.get("tool_use_id", ""),
                            "content": str(b.get("content", "")),
                        }
                    )
                elif b.get("type") == "text":
                    text_parts.append(b.get("text", ""))
            if text_parts:
                out.append({"role": "user", "content": "".join(text_parts)})
    return out


class OpenAICompatibleProvider:
    """An AIProvider backed by any OpenAI chat-completions endpoint (OpenAI itself
    or DeepSeek). `name` matches the `ai_provider` setting value."""

    def __init__(
        self,
        *,
        name: str,
        api_key: str,
        model: str,
        base_url: str,
        supports_vision: bool,
    ) -> None:
        self.name = name
        self._api_key = api_key
        self._model = model
        self._base_url = base_url.rstrip("/")
        self._supports_vision = supports_vision

    async def _post(self, payload: dict) -> dict:
        headers = {
            "authorization": f"Bearer {self._api_key}",
            "content-type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                resp = await client.post(
                    f"{self._base_url}/chat/completions", headers=headers, json=payload
                )
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            # Surface status only — never the key or full request headers.
            raise RuntimeError(
                f"AI provider request failed: HTTP {e.response.status_code}"
            ) from None
        except httpx.HTTPError as e:
            raise RuntimeError(f"AI provider request failed: {type(e).__name__}") from None
        return resp.json()

    async def suggest_tags(
        self,
        *,
        title: str,
        cover_png: bytes | None,
        existing: dict,
    ) -> TagSuggestion:
        # Only forward the title + existing tags — never audio, paths, or anything else.
        context = {
            "title": title,
            "existing": {
                k: existing.get(k) for k in ("genre", "mood", "tags") if existing.get(k)
            },
        }
        text = f"{_PROMPT}\n{json.dumps(context, ensure_ascii=False)}"
        content: str | list[dict]
        if cover_png and self._supports_vision:
            data_uri = (
                f"data:{_media_type(cover_png)};base64,"
                + base64.b64encode(cover_png).decode("ascii")
            )
            content = [
                {"type": "image_url", "image_url": {"url": data_uri}},
                {"type": "text", "text": text},
            ]
        else:
            content = text

        payload = {
            "model": self._model,
            "max_tokens": _MAX_TOKENS,
            "messages": [{"role": "user", "content": content}],
        }
        data = await self._post(payload)
        reply = self._first_message(data).get("content") or ""
        return _parse_suggestion(reply if isinstance(reply, str) else "")

    async def run_chat(self, *, messages: list[dict], tools: list[dict]) -> ChatTurn:
        payload: dict = {
            "model": self._model,
            "max_tokens": _CHAT_MAX_TOKENS,
            "messages": _to_openai_messages(messages),
        }
        if tools:
            payload["tools"] = _to_openai_tools(tools)
        data = await self._post(payload)

        choice = (data.get("choices") or [{}])[0]
        msg = choice.get("message") or {}
        text = msg.get("content")
        text = text if isinstance(text, str) else ""

        tool_uses: list[ToolUse] = []
        for tc in msg.get("tool_calls") or []:
            fn = tc.get("function") or {}
            try:
                parsed = json.loads(fn.get("arguments") or "{}")
            except (json.JSONDecodeError, TypeError):
                parsed = {}
            tool_uses.append(
                ToolUse(
                    id=tc.get("id") or "",
                    name=fn.get("name") or "",
                    input=parsed if isinstance(parsed, dict) else {},
                )
            )

        # Normalise to the Anthropic stop_reason the chat loop branches on.
        stop_reason = "tool_use" if tool_uses else (choice.get("finish_reason") or "stop")
        return ChatTurn(stop_reason=stop_reason, text=text, tool_uses=tool_uses)

    @staticmethod
    def _first_message(data: dict) -> dict:
        return (data.get("choices") or [{}])[0].get("message") or {}
