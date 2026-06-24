"""/api/app_settings — catalog-level key/value JSON store.

Single-user, single-key-per-request endpoints. Schema is set by the caller
(renderer); this layer just round-trips JSON.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Request, Response

from beatos_core.app_settings.service import (
    delete_setting,
    get_setting,
    set_setting,
)
from beatos_http.api_auth import (
    SECRET_SETTING_KEYS,
    SENSITIVE_SETTING_KEYS,
    require_api_token,
)


router = APIRouter(prefix="/api/app_settings", tags=["app-settings"])


@router.get("/{key}")
async def get(key: str) -> dict:
    """Return `{key, value}` where value is the decoded JSON (or null when
    unset). Always 200 — absence is signaled by value=null, not 404 —
    so the renderer doesn't need separate error branches for "never set".

    Secret keys (e.g. a BYO AI key) are never returned: value is forced to null
    and `is_set` tells the renderer whether one exists, so a masked field can
    show "configured" without ever reading the secret back."""
    value = await get_setting(key)
    if key in SECRET_SETTING_KEYS:
        return {"key": key, "value": None, "secret": True, "is_set": value not in (None, "")}
    return {"key": key, "value": value}


@router.put("/{key}")
async def put(key: str, request: Request, body: dict[str, Any] = Body(...)) -> dict:
    """Upsert. Body shape: `{"value": <json>}`. The value may be any
    JSON-serializable shape (array, object, scalar)."""
    if key in SENSITIVE_SETTING_KEYS:
        require_api_token(request)
    value = body.get("value")
    await set_setting(key, value)
    return {"key": key, "value": value}


@router.delete("/{key}", status_code=204)
async def remove(key: str, request: Request) -> Response:
    if key in SENSITIVE_SETTING_KEYS:
        require_api_token(request)
    await delete_setting(key)
    return Response(status_code=204)
