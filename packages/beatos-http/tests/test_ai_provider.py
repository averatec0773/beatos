"""EPIC-D4c-1: Anthropic provider + provider resolution + model setting."""
from __future__ import annotations

import httpx
import pytest

from beatos_core.app_settings.service import set_setting
from beatos_core.db import run_migrations

from beatos_http.ai import service
from beatos_http.ai.anthropic_provider import (
    AnthropicProvider,
    _media_type,
    _parse_suggestion,
)


@pytest.fixture
def db(tmp_path, monkeypatch):
    p = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    return p


# --- pure helpers ---------------------------------------------------------

def test_media_type_sniffs_png_jpeg_webp():
    assert _media_type(b"\x89PNG\r\n\x1a\n....") == "image/png"
    assert _media_type(b"\xff\xd8\xff\xe0xx") == "image/jpeg"
    assert _media_type(b"RIFF\x00\x00\x00\x00WEBPxx") == "image/webp"
    assert _media_type(b"unknown") == "image/jpeg"


def test_parse_suggestion_extracts_json_amid_prose():
    text = 'Sure! Here you go:\n{"genre":["Trap"],"mood":["Dark"],"tags":["808"],"description":"Dark trap."} hope it helps'
    s = _parse_suggestion(text)
    assert s.genre == ["Trap"]
    assert s.mood == ["Dark"]
    assert s.tags == ["808"]
    assert s.description == "Dark trap."


def test_parse_suggestion_empty_on_garbage():
    s = _parse_suggestion("no json here")
    assert s.genre == [] and s.mood == [] and s.tags == [] and s.description is None


# --- provider network call (httpx mocked) ---------------------------------

class _FakeResp:
    status_code = 200

    def raise_for_status(self) -> None:  # noqa: D401
        pass

    def json(self) -> dict:
        return {
            "content": [
                {"type": "text", "text": '{"genre":["Trap"],"mood":["Dark"],"tags":["808"],"description":"x"}'}
            ]
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
        return _FakeResp()


async def test_suggest_tags_sends_only_allowed_data_and_parses(monkeypatch):
    monkeypatch.setattr(httpx, "AsyncClient", _FakeClient)
    provider = AnthropicProvider(api_key="sk-secret", model="claude-haiku-4-5")
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16

    result = await provider.suggest_tags(
        title="Midnight Drive",
        cover_png=png,
        existing={"genre": ["Trap"], "audio_path": "/secret/path.wav", "bpm": 140},
    )

    assert result.genre == ["Trap"] and result.mood == ["Dark"] and result.tags == ["808"]

    sent = _FakeClient.last
    # Key travels in the header (sent) but the privacy scope is enforced in the body.
    assert sent["headers"]["x-api-key"] == "sk-secret"
    body = sent["json"]
    assert body["model"] == "claude-haiku-4-5"
    serialized = str(body)
    # Only title + existing tag-ish fields + the image — never paths/audio/bpm.
    assert "Midnight Drive" in serialized
    assert "/secret/path.wav" not in serialized
    assert "audio_path" not in serialized
    assert "bpm" not in serialized
    # The cover image block is present.
    kinds = {b["type"] for b in body["messages"][0]["content"]}
    assert "image" in kinds and "text" in kinds


# --- provider resolution + model setting ----------------------------------

async def test_get_active_provider_off_by_default(db):
    await run_migrations(db)
    assert await service.get_active_provider() is None


async def test_get_active_provider_returns_anthropic_when_configured(db):
    await run_migrations(db)
    await set_setting(service.AI_PROVIDER_KEY, "anthropic")
    await set_setting(service.AI_API_KEY, "sk-x")
    p = await service.get_active_provider()
    assert isinstance(p, AnthropicProvider)
    assert p.name == "anthropic"


async def test_get_active_provider_none_without_key(db):
    await run_migrations(db)
    await set_setting(service.AI_PROVIDER_KEY, "anthropic")
    assert await service.get_active_provider() is None


async def test_model_default_and_selection(db):
    await run_migrations(db)
    assert await service.get_ai_model() == "claude-haiku-4-5"
    await set_setting(service.AI_MODEL_KEY, "claude-sonnet-4-6")
    assert await service.get_ai_model() == "claude-sonnet-4-6"
    # Unknown model falls back to the default.
    await set_setting(service.AI_MODEL_KEY, "gpt-nope")
    assert await service.get_ai_model() == "claude-haiku-4-5"


async def test_status_includes_model_fields(db):
    await run_migrations(db)
    s = await service.get_ai_status()
    assert s["model"] == "claude-haiku-4-5"
    assert s["supported_models"] == ["claude-haiku-4-5", "claude-sonnet-4-6"]
