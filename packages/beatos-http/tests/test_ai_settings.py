"""EPIC-D4a: in-app AI config + status + secret-key redaction."""
from __future__ import annotations

import pytest

from beatos_core.app_settings.service import set_setting
from beatos_core.db import run_migrations

from beatos_http.ai.service import AI_API_KEY, AI_PROVIDER_KEY, get_ai_status, has_api_key
from beatos_http.api_auth import SECRET_SETTING_KEYS, SENSITIVE_SETTING_KEYS
from beatos_http.routes.app_settings import get as get_setting_route


@pytest.fixture
def db(tmp_path, monkeypatch):
    p = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    return p


async def test_status_default_off(db):
    await run_migrations(db)
    s = await get_ai_status()
    assert s == {
        "provider": None,
        "has_key": False,
        "enabled": False,
        "model": "claude-haiku-4-5",
        "supported": ["anthropic"],
        "supported_models": ["claude-haiku-4-5", "claude-sonnet-4-6"],
    }


async def test_status_enabled_with_provider_and_key(db):
    await run_migrations(db)
    await set_setting(AI_PROVIDER_KEY, "anthropic")
    await set_setting(AI_API_KEY, "sk-super-secret")
    s = await get_ai_status()
    assert s["provider"] == "anthropic"
    assert s["has_key"] is True
    assert s["enabled"] is True
    # The status must never carry the key value.
    assert "sk-super-secret" not in str(s)


async def test_provider_without_key_is_not_enabled(db):
    await run_migrations(db)
    await set_setting(AI_PROVIDER_KEY, "anthropic")
    s = await get_ai_status()
    assert s["has_key"] is False
    assert s["enabled"] is False


async def test_unknown_provider_not_enabled_even_with_key(db):
    await run_migrations(db)
    await set_setting(AI_PROVIDER_KEY, "totally-made-up")
    await set_setting(AI_API_KEY, "sk-x")
    s = await get_ai_status()
    assert s["enabled"] is False


async def test_get_route_never_returns_the_secret_key(db):
    await run_migrations(db)
    await set_setting(AI_API_KEY, "sk-leak-me-not")
    out = await get_setting_route(AI_API_KEY)
    assert out["value"] is None
    assert out["secret"] is True
    assert out["is_set"] is True
    assert "sk-leak-me-not" not in str(out)
    # The service still sees it (server-side use only).
    assert await has_api_key() is True


def test_key_classification():
    assert "ai_api_key" in SECRET_SETTING_KEYS
    assert {"ai_api_key", "ai_provider"} <= SENSITIVE_SETTING_KEYS
