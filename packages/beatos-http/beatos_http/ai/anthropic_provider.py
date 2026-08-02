"""Anthropic cloud provider for in-app tagging (EPIC-D4c).

Calls the Messages API over httpx with the track's cover as a base64 image block
plus the title and existing tags, and parses a JSON reply into a TagSuggestion.

Privacy: ONLY the cover image, title, and existing genre/mood/tags are sent — no
audio, no file paths, no other library data. The caller triggers this explicitly.
The API key is sent as a header and is NEVER logged (no key in any log line or
re-raised error).
"""
from __future__ import annotations

import base64
import json
import logging

import httpx

from beatos_http.ai.provider import ChatTurn, TagSuggestion, ToolUse

log = logging.getLogger(__name__)

_API_URL = "https://api.anthropic.com/v1/messages"
_API_VERSION = "2023-06-01"
_MAX_TOKENS = 600
_TIMEOUT = 30.0
_CHAT_MAX_TOKENS = 1024
_CHAT_SYSTEM = (
    "You are BeatOS's in-app assistant for a music producer's beat catalog. "
    "Use the provided tools to find and report catalog data. Be concise and "
    "concrete; cite track titles and ids. Do not invent tracks or fields."
)

_PROMPT = (
    "You are tagging a music beat for a producer's catalog. From the cover image "
    "(if given), the title, and any existing tags, propose concise metadata. "
    "Reply with ONLY a JSON object, no prose, of the shape: "
    '{"genre": [..], "mood": [..], "tags": [..], "description": ".."}. '
    "Use short English tags; keep each list to a few high-confidence items; "
    "description is one short sentence. Context follows as JSON:"
)


def _media_type(data: bytes) -> str:
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return "image/jpeg"


def _parse_suggestion(text: str) -> TagSuggestion:
    """Extract the JSON object from the model's reply (tolerating stray prose or
    code fences) and coerce it into a TagSuggestion. Returns an empty suggestion
    if nothing parseable is found."""
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        return TagSuggestion()
    try:
        obj = json.loads(text[start : end + 1])
    except (json.JSONDecodeError, TypeError):
        return TagSuggestion()
    if not isinstance(obj, dict):
        return TagSuggestion()

    def _str_list(v: object) -> list[str]:
        if isinstance(v, list):
            return [str(x).strip() for x in v if str(x).strip()]
        return []

    desc = obj.get("description")
    return TagSuggestion(
        genre=_str_list(obj.get("genre")),
        mood=_str_list(obj.get("mood")),
        tags=_str_list(obj.get("tags")),
        description=str(desc).strip() if isinstance(desc, str) and desc.strip() else None,
    )


class AnthropicProvider:
    """An AIProvider backed by the Anthropic Messages API."""

    name = "anthropic"

    def __init__(self, *, api_key: str, model: str) -> None:
        self._api_key = api_key
        self._model = model

    async def suggest_tags(
        self,
        *,
        title: str,
        cover_png: bytes | None,
        existing: dict,
    ) -> TagSuggestion:
        content: list[dict] = []
        if cover_png:
            content.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": _media_type(cover_png),
                        "data": base64.b64encode(cover_png).decode("ascii"),
                    },
                }
            )
        # Only forward the title + existing tags — never audio, paths, or anything else.
        context = {
            "title": title,
            "existing": {
                k: existing.get(k)
                for k in ("genre", "mood", "tags")
                if existing.get(k)
            },
        }
        content.append({"type": "text", "text": f"{_PROMPT}\n{json.dumps(context, ensure_ascii=False)}"})

        payload = {
            "model": self._model,
            "max_tokens": _MAX_TOKENS,
            "messages": [{"role": "user", "content": content}],
        }
        headers = {
            "x-api-key": self._api_key,
            "anthropic-version": _API_VERSION,
            "content-type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                resp = await client.post(_API_URL, headers=headers, json=payload)
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            # Surface status only — never the key or full request headers.
            raise RuntimeError(f"AI provider request failed: HTTP {e.response.status_code}") from None
        except httpx.HTTPError as e:
            raise RuntimeError(f"AI provider request failed: {type(e).__name__}") from None

        data = resp.json()
        text = "".join(
            block.get("text", "")
            for block in data.get("content", [])
            if block.get("type") == "text"
        )
        return _parse_suggestion(text)

    async def run_chat(
        self, *, messages: list[dict], tools: list[dict], system: str | None = None
    ) -> ChatTurn:
        payload = {
            "model": self._model,
            "max_tokens": _CHAT_MAX_TOKENS,
            "system": system or _CHAT_SYSTEM,
            "messages": messages,
            "tools": tools,
        }
        headers = {
            "x-api-key": self._api_key,
            "anthropic-version": _API_VERSION,
            "content-type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                resp = await client.post(_API_URL, headers=headers, json=payload)
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise RuntimeError(
                f"AI provider request failed: HTTP {e.response.status_code}"
            ) from None
        except httpx.HTTPError as e:
            raise RuntimeError(f"AI provider request failed: {type(e).__name__}") from None

        data = resp.json()
        blocks = data.get("content", [])
        text = "".join(b.get("text", "") for b in blocks if b.get("type") == "text")
        tool_uses = [
            ToolUse(id=b["id"], name=b["name"], input=b.get("input") or {})
            for b in blocks
            if b.get("type") == "tool_use"
        ]
        return ChatTurn(stop_reason=data.get("stop_reason", ""), text=text, tool_uses=tool_uses)
