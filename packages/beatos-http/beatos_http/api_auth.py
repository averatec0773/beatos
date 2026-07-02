"""Local token guard for the agent-control endpoints on the otherwise-no-auth
/api surface.

In the packaged Electron app, CORS allows the file:// ("null") origin so the
renderer can reach the localhost API — but that also lets any local .html the
user opens reach it. A handful of settings writes defeat the human-in-the-loop
gate if called by such a page — chiefly flipping `agent_permission_mode` out of
its enforced state, plus writing AI provider / API-key settings. The Electron
main mints a random `BEATOS_API_TOKEN`, passes it to the sidecar and exposes it
to the renderer through the preload bridge (which a file:// page lacks); these
endpoints then require it.

No-op in web mode: there `BEATOS_API_TOKEN` is unset, the SPA is same-origin, and
CORS already preflight-blocks cross-origin writes — so the guard stands down.
"""
from __future__ import annotations

import os

from fastapi import HTTPException, Request

# app_setting keys whose write must carry the token when one is configured.
SENSITIVE_SETTING_KEYS = frozenset({"agent_permission_mode", "ai_provider", "ai_api_key"})

# Secret keys are write-gated AND never returned by the generic GET
# /api/app_settings/{key}; clients see only whether one is set (e.g. via
# /api/ai/status). A BYO AI key is stored locally but must not be readable back.
SECRET_SETTING_KEYS = frozenset({"ai_api_key"})


def get_api_token() -> str | None:
    """The configured local API token, or None when the guard is disabled
    (web mode / no Electron). Read fresh from the env (not cached) so tests and
    process restarts pick up the current value."""
    return os.environ.get("BEATOS_API_TOKEN") or None


def require_api_token(request: Request) -> None:
    """Enforce `Authorization: Bearer <token>` on an agent-control request.
    No-op when no token is configured."""
    token = get_api_token()
    if token is None:
        return
    if request.headers.get("authorization") != f"Bearer {token}":
        raise HTTPException(status_code=401, detail="unauthorized")
