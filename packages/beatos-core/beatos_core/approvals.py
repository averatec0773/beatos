"""Canonical 2PC apply dispatcher.

The first phase of a write tool stashes a prepared payload under a `pending`
token (see `beatos_core.two_phase`). The second phase — approving the token —
runs the registered apply handler for that token's `tool_name`: it verifies the
token, performs the actual write, and consumes the token, all within the
CALLER's transaction (the caller commits).

This registry lives in beatos-core (not the HTTP route layer) so BOTH approval
paths share one canonical dispatch:
- the human approve endpoint (`beatos_http.routes.tokens`), and
- the MCP auto-approve path (`beatos_mcp.policy.submit_write`, agent permission
  policy = auto_approve).

Handlers may physically live in any layer (catalog handlers in
`beatos_http/handlers/*`, the Pro-gated publish handler in the HTTP layer) — they
register into this registry at import time. beatos-core never imports them, so it
stays free of web/RPC/electron deps (layering rule 2); registration is a runtime
side effect in the shared sidecar process.
"""
from __future__ import annotations

from typing import Awaitable, Callable

import aiosqlite

from beatos_core.two_phase import TokenError

ApplyHandler = Callable[[aiosqlite.Connection, str], Awaitable[dict]]

_APPLY_HANDLERS: dict[str, ApplyHandler] = {}


class ApplyHandlerNotFound(RuntimeError):
    """No apply handler is registered for a token's tool_name."""


def register_apply_handler(tool_name: str) -> Callable[[ApplyHandler], ApplyHandler]:
    """Decorator: register `fn` as the apply handler for `tool_name`."""
    def decorator(fn: ApplyHandler) -> ApplyHandler:
        _APPLY_HANDLERS[tool_name] = fn
        return fn
    return decorator


async def apply_token(conn: aiosqlite.Connection, token: str) -> dict:
    """Dispatch a pending token to its registered apply handler.

    The handler verifies + writes + consumes the token within `conn`'s
    transaction; the CALLER is responsible for committing. Raises:
    - `TokenError` if the token row is missing,
    - `ApplyHandlerNotFound` if no handler is registered for its tool_name,
    - plus whatever the handler raises (`TokenError`, `RowVanishedError`).
    """
    async with conn.execute(
        "SELECT tool_name FROM tokens WHERE token=?", (token,)
    ) as cur:
        row = await cur.fetchone()
    if row is None:
        raise TokenError(f"token not found: {token}")
    tool_name = row[0]
    handler = _APPLY_HANDLERS.get(tool_name)
    if handler is None:
        raise ApplyHandlerNotFound(f"no apply handler for tool: {tool_name}")
    return await handler(conn, token)
