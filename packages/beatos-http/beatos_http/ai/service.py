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
AI_PROVIDER_KEY = "ai_provider"  # "" / None = off; e.g. "anthropic" / "openai" / "deepseek"
AI_API_KEY = "ai_api_key"  # secret — write-gated, never read back
AI_MODEL_KEY = "ai_model"  # which model to use; not secret

# Providers we know how to drive. anthropic = Claude; openai = ChatGPT; deepseek
# is OpenAI-compatible (same wire format, different base URL — see openai_provider).
SUPPORTED_PROVIDERS: tuple[str, ...] = ("anthropic", "openai", "deepseek")

# Models the user can pick per provider (Settings). The first entry is the default.
PROVIDER_MODELS: dict[str, tuple[str, ...]] = {
    "anthropic": ("claude-haiku-4-5", "claude-sonnet-4-6"),
    "openai": ("gpt-4o-mini", "gpt-4o"),
    "deepseek": ("deepseek-chat",),
}
# Model resolution falls back to this provider's list when none is selected yet, so
# get_ai_model()/get_ai_status() stay stable (and back-compatible) before setup.
_FALLBACK_PROVIDER = "anthropic"

# Back-compat aliases (older callers referenced these flat names).
SUPPORTED_MODELS: tuple[str, ...] = PROVIDER_MODELS[_FALLBACK_PROVIDER]
DEFAULT_MODEL = PROVIDER_MODELS[_FALLBACK_PROVIDER][0]


def _models_for(provider: str | None) -> tuple[str, ...]:
    return PROVIDER_MODELS.get(provider or "", PROVIDER_MODELS[_FALLBACK_PROVIDER])


def _default_model_for(provider: str | None) -> str:
    return _models_for(provider)[0]


async def _stored_provider() -> str | None:
    val = await get_setting(AI_PROVIDER_KEY)
    return val if isinstance(val, str) and val else None


async def has_api_key() -> bool:
    """True iff a non-empty key is stored. Never returns the key itself."""
    val = await get_setting(AI_API_KEY)
    return isinstance(val, str) and val.strip() != ""


async def get_ai_model() -> str:
    """The selected model, or the provider's default when unset/unknown. Models are
    provider-scoped, so a stored model from a different provider falls back too."""
    provider = await _stored_provider()
    models = _models_for(provider)
    val = await get_setting(AI_MODEL_KEY)
    return val if isinstance(val, str) and val in models else _default_model_for(provider)


async def get_ai_status() -> dict:
    """Client-safe AI status. Contains no secret: only the selected provider,
    whether a key is set, the model, and whether AI tagging is currently usable.
    `supported_models` is scoped to the selected provider (falls back to the
    default provider's list before one is chosen)."""
    provider = await _stored_provider()
    has_key = await has_api_key()
    enabled = provider in SUPPORTED_PROVIDERS and has_key
    return {
        "provider": provider,
        "has_key": has_key,
        "enabled": enabled,
        "model": await get_ai_model(),
        "supported": list(SUPPORTED_PROVIDERS),
        "supported_models": list(_models_for(provider)),
    }


async def get_active_provider() -> "AIProvider | None":
    """The configured provider when AI is enabled (a supported provider is
    selected AND a key is set), else None. Reads the key here but never logs it."""
    provider = await _stored_provider()
    if provider not in SUPPORTED_PROVIDERS:
        return None
    key = await get_setting(AI_API_KEY)
    if not (isinstance(key, str) and key.strip()):
        return None
    api_key = key.strip()
    model = await get_ai_model()
    # Imported lazily so beatos_http.ai.service has no httpx import cost when AI is off.
    if provider == "anthropic":
        from beatos_http.ai.anthropic_provider import AnthropicProvider

        return AnthropicProvider(api_key=api_key, model=model)

    from beatos_http.ai.openai_provider import OpenAICompatibleProvider

    if provider == "openai":
        return OpenAICompatibleProvider(
            name="openai",
            api_key=api_key,
            model=model,
            base_url="https://api.openai.com/v1",
            supports_vision=True,
        )
    if provider == "deepseek":
        return OpenAICompatibleProvider(
            name="deepseek",
            api_key=api_key,
            model=model,
            base_url="https://api.deepseek.com/v1",
            supports_vision=False,
        )
    return None
