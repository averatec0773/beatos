"""In-app AI tagging config + status (EPIC-D4a).

Default OFF: no provider is active until the user selects one AND supplies a key.
The key is stored locally in app_settings under `ai_api_key`, which is write-gated
and never returned to clients (api_auth.SECRET_SETTING_KEYS). Nothing here ever
logs the key value.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from beatos_core.app_settings.service import get_setting

if TYPE_CHECKING:
    from beatos_http.ai.provider import AIProvider

# Setting keys (the renderer / HTTP layer own the schema; see app_settings).
AI_PROVIDER_KEY = "ai_provider"  # "" / None = off; e.g. "anthropic"
AI_API_KEY = "ai_api_key"  # secret — write-gated, never read back
AI_MODEL_KEY = "ai_model"  # which model to use; not secret

# Providers we know how to drive.
SUPPORTED_PROVIDERS: tuple[str, ...] = ("anthropic",)

# Vision-capable models the user can pick (Settings). Default is the cheaper Haiku.
SUPPORTED_MODELS: tuple[str, ...] = ("claude-haiku-4-5", "claude-sonnet-4-6")
DEFAULT_MODEL = "claude-haiku-4-5"


async def _stored_provider() -> str | None:
    val = await get_setting(AI_PROVIDER_KEY)
    return val if isinstance(val, str) and val else None


async def has_api_key() -> bool:
    """True iff a non-empty key is stored. Never returns the key itself."""
    val = await get_setting(AI_API_KEY)
    return isinstance(val, str) and val.strip() != ""


async def get_ai_model() -> str:
    """The selected model, or the default when unset/unknown."""
    val = await get_setting(AI_MODEL_KEY)
    return val if isinstance(val, str) and val in SUPPORTED_MODELS else DEFAULT_MODEL


async def get_ai_status() -> dict:
    """Client-safe AI status. Contains no secret: only the selected provider,
    whether a key is set, the model, and whether AI tagging is currently usable."""
    provider = await _stored_provider()
    has_key = await has_api_key()
    enabled = provider in SUPPORTED_PROVIDERS and has_key
    return {
        "provider": provider,
        "has_key": has_key,
        "enabled": enabled,
        "model": await get_ai_model(),
        "supported": list(SUPPORTED_PROVIDERS),
        "supported_models": list(SUPPORTED_MODELS),
    }


async def get_active_provider() -> "AIProvider | None":
    """The configured provider when AI is enabled (a supported provider is
    selected AND a key is set), else None. Reads the key here but never logs it."""
    provider = await _stored_provider()
    if provider != "anthropic":
        return None
    key = await get_setting(AI_API_KEY)
    if not (isinstance(key, str) and key.strip()):
        return None
    # Imported lazily so beatos_http.ai.service has no httpx import cost when AI is off.
    from beatos_http.ai.anthropic_provider import AnthropicProvider

    return AnthropicProvider(api_key=key.strip(), model=await get_ai_model())
