"""Single chokepoint for MCP write tools (L1 confirmation model).

Writes apply directly under the client's own consent (L1) and are recorded to
the `agent_action_log`; there is no 2PC token or in-app approval. One setting,
`agent_permission_mode`, keeps a safety switch: `read_only` refuses writes,
`enabled` (default) applies them.

Read tools (annotated readOnlyHint=True) never call this — they run directly.
Every write tool routes its tail through `submit_write()`. This is also the single
seam where a future elicitation upgrade would branch (check the client's
`elicitation` capability and `ctx.elicit(...)` before applying) — keeping the
branch in one place is why the chokepoint is preserved.
"""
from __future__ import annotations

from typing import Any

from beatos_core.agent_log import record_agent_action
from beatos_core.app_settings.service import get_setting
from beatos_core.approvals import apply
from beatos_mcp.db import connect_writable

SETTING_KEY = "agent_permission_mode"

ENABLED = "enabled"
READ_ONLY = "read_only"
VALID_MODES = (ENABLED, READ_ONLY)
DEFAULT_MODE = ENABLED
# Pre-L1 values map onto the new model: both meant "writes happen".
_LEGACY = {"confirm": ENABLED, "auto_approve": ENABLED}


class WritesDisabledError(ValueError):
    """Raised when a write tool is invoked under read_only mode."""


async def get_permission_mode() -> str:
    """Resolve the current mode. Unknown/legacy values map to `enabled`."""
    mode = await get_setting(SETTING_KEY)
    if mode in VALID_MODES:
        return mode
    return _LEGACY.get(mode, DEFAULT_MODE)


def _client_name() -> str:
    # Phase 1: per-connection clientInfo wiring is Phase B (dashboard providers).
    # '' is valid — agent_action_log.client_name is NOT NULL DEFAULT ''.
    return ""


async def submit_write(tool_name: str, payload: dict[str, Any]) -> dict:
    """Apply a prepared write directly, record it, and return the result.

    - enabled (default): apply via the registry on one writable connection
      (PRAGMA foreign_keys=ON, so ON DELETE CASCADE fires on purge — rule 9),
      record an 'applied' audit row, commit; returns {status:"applied", result}.
    - read_only: record 'refused_read_only' and raise WritesDisabledError.

    On a handler error the write transaction rolls back, a 'failed' audit row is
    recorded on a fresh connection, and the error is re-raised so the MCP tool
    surfaces it.
    """
    mode = await get_permission_mode()
    summary = payload.get("preview") if isinstance(payload, dict) else None

    if mode == READ_ONLY:
        async with connect_writable() as conn:
            await record_agent_action(
                conn,
                tool_name=tool_name,
                summary=summary,
                client_name=_client_name(),
                status="refused_read_only",
                result="read_only",
            )
            await conn.commit()
        raise WritesDisabledError(
            "BeatOS is in read-only mode; writes are disabled. "
            "Change it in Settings → AI Integration."
        )

    try:
        async with connect_writable() as conn:
            await conn.execute("PRAGMA foreign_keys = ON")
            result = await apply(conn, tool_name, payload)
            await record_agent_action(
                conn,
                tool_name=tool_name,
                summary=summary,
                client_name=_client_name(),
                status="applied",
                result=result,
            )
            await conn.commit()
        return {"status": "applied", "result": result}
    except Exception as e:
        async with connect_writable() as conn:
            await record_agent_action(
                conn,
                tool_name=tool_name,
                summary=summary,
                client_name=_client_name(),
                status="failed",
                result=str(e),
            )
            await conn.commit()
        raise
