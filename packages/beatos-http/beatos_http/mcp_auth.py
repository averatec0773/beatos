"""Local token guard for the /mcp endpoint.

/mcp is the MCP transport (Claude Desktop / Claude Code reach it through the
beatos-mcp launcher → mcp-proxy). It carries no auth by default, so any local
process could reach the agent surface — which matters more once writes can
auto-apply (agent_permission_mode = auto_approve). We mint a per-process random
token, advertise it in the handshake file (the launcher reads it and passes it as
an Authorization header), and require it on /mcp.

The renderer and the web SPA talk to /api/* (never /mcp), so this guard does not
affect them — the blast radius is exactly the MCP transport. Set
BEATOS_MCP_DISABLE_AUTH=1 to turn the guard off (kill-switch).
"""
from __future__ import annotations

import os
import secrets
from functools import lru_cache


@lru_cache(maxsize=1)
def get_mcp_token() -> str | None:
    """Process-stable local token for /mcp, or None when auth is disabled.

    Cached so the value advertised in the handshake matches the value the guard
    enforces within the same sidecar process."""
    if os.environ.get("BEATOS_MCP_DISABLE_AUTH") == "1":
        return None
    return secrets.token_urlsafe(32)


def guard_mcp_app(app, token: str | None):
    """Wrap an ASGI app so HTTP requests must carry `Authorization: Bearer <token>`.
    Returns the app unwrapped when token is None (auth disabled). Non-HTTP scopes
    (lifespan) always pass through."""
    if token is None:
        return app

    expected = f"Bearer {token}".encode()

    async def wrapped(scope, receive, send):
        if scope.get("type") == "http":
            headers = dict(scope.get("headers") or [])
            if headers.get(b"authorization") != expected:
                await send({
                    "type": "http.response.start",
                    "status": 401,
                    "headers": [(b"content-type", b"text/plain; charset=utf-8")],
                })
                await send({"type": "http.response.body", "body": b"unauthorized"})
                return
        await app(scope, receive, send)

    return wrapped
