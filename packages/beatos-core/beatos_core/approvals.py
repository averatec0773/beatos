"""Canonical apply dispatcher for agent write tools.

Each write tool's logic registers here under its tool name and is invoked
directly (with the prepared payload) by the single chokepoint
`beatos_core.agent_permission.submit_write` (re-exported as `beatos_mcp.policy`
for the MCP server). The handler performs the write within the CALLER's
transaction (the caller commits).

This registry lives in beatos-core so the chokepoint and the handlers
(beatos-http) share one canonical dispatch. beatos-core never imports the
handlers — they register into this registry at import time (layering rule 2).
"""
from __future__ import annotations

from typing import Awaitable, Callable

import aiosqlite

# A handler takes the live connection + the prepared payload and returns a result
# dict. It must perform its write within the caller's transaction.
ApplyHandler = Callable[[aiosqlite.Connection, dict], Awaitable[dict]]

_APPLY_HANDLERS: dict[str, ApplyHandler] = {}


class ApplyHandlerNotFound(RuntimeError):
    """No apply handler is registered for a tool name."""


class RowVanishedError(RuntimeError):
    """Raised by a handler when an UPDATE/DELETE/INSERT affects 0 rows because the
    target was deleted concurrently. The caller (submit_write) rolls back and
    surfaces it as a failed action."""


def register_apply_handler(tool_name: str) -> Callable[[ApplyHandler], ApplyHandler]:
    """Decorator: register `fn` as the apply handler for `tool_name`."""

    def decorator(fn: ApplyHandler) -> ApplyHandler:
        _APPLY_HANDLERS[tool_name] = fn
        return fn

    return decorator


async def apply(conn: aiosqlite.Connection, tool_name: str, payload: dict) -> dict:
    """Dispatch a prepared write to its registered handler.

    The handler writes within `conn`'s transaction; the CALLER commits. Raises
    `ApplyHandlerNotFound` if no handler is registered, plus whatever the handler
    raises (e.g. `RowVanishedError`).
    """
    handler = _APPLY_HANDLERS.get(tool_name)
    if handler is None:
        raise ApplyHandlerNotFound(f"no apply handler for tool: {tool_name}")
    return await handler(conn, payload)
