"""In-app AI tagging config + status (EPIC-D4a).

Default OFF: no provider is active until the user selects one AND supplies a key.
The key is stored locally in app_settings under `ai_api_key`, which is write-gated
and never returned to clients (api_auth.SECRET_SETTING_KEYS). Nothing here ever
logs the key value.
"""
from __future__ import annotations

from beatos_core.app_settings.service import get_setting

# Setting keys (the renderer / HTTP layer own the schema; see app_settings).
AI_PROVIDER_KEY = "ai_provider"  # "" / None = off; e.g. "anthropic"
AI_API_KEY = "ai_api_key"  # secret — write-gated, never read back

# Providers we know how to drive. The concrete network impl is added later.
SUPPORTED_PROVIDERS: tuple[str, ...] = ("anthropic",)


async def _stored_provider() -> str | None:
    val = await get_setting(AI_PROVIDER_KEY)
    return val if isinstance(val, str) and val else None


async def has_api_key() -> bool:
    """True iff a non-empty key is stored. Never returns the key itself."""
    val = await get_setting(AI_API_KEY)
    return isinstance(val, str) and val.strip() != ""


async def get_ai_status() -> dict:
    """Client-safe AI status. Contains no secret: only the selected provider,
    whether a key is set, and whether AI tagging is currently usable."""
    provider = await _stored_provider()
    has_key = await has_api_key()
    enabled = provider in SUPPORTED_PROVIDERS and has_key
    return {
        "provider": provider,
        "has_key": has_key,
        "enabled": enabled,
        "supported": list(SUPPORTED_PROVIDERS),
    }
