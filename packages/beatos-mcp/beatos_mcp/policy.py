"""Agent permission policy for MCP write tools.

One global setting, `agent_permission_mode`, governs how every MCP write tool is
gated:
- "confirm" (default): create a pending 2PC token; a human approves it in the
  BeatOS Agent Actions panel (the original behaviour).
- "auto_approve": create the token AND apply it immediately in-process, returning
  the result inline. The token row is still recorded (then consumed) so the Agent
  Actions history shows everything the agent did.
- "read_only": refuse before creating any token.

Read tools (annotated readOnlyHint=True) never call this — they run directly.
Every write tool routes its tail through `submit_write()`, which is the single
enforcement point for the policy.
"""
from __future__ import annotations

from typing import Any

from beatos_core.app_settings.service import get_setting
from beatos_core.approvals import apply_token
from beatos_core.two_phase import create_token
from beatos_mcp.db import connect_writable

SETTING_KEY = "agent_permission_mode"

CONFIRM = "confirm"
AUTO_APPROVE = "auto_approve"
READ_ONLY = "read_only"
VALID_MODES = (CONFIRM, AUTO_APPROVE, READ_ONLY)
DEFAULT_MODE = CONFIRM


class WritesDisabledError(ValueError):
    """Raised when a write tool is invoked under read_only mode."""


async def get_permission_mode() -> str:
    """Resolve the current agent permission mode. Absent / unknown → confirm
    (default-safe: never silently auto-approve)."""
    mode = await get_setting(SETTING_KEY)
    return mode if mode in VALID_MODES else DEFAULT_MODE


async def submit_write(tool_name: str, payload: dict[str, Any]) -> dict:
    """Apply the agent permission policy to a prepared write payload.

    Returns a uniform envelope:
    - confirm:      {token, status:"awaiting_approval", expires_at, message}
    - auto_approve: {token, status:"approved", result}
    Raises WritesDisabledError under read_only.

    In auto_approve, token-create + apply (write) + consume commit atomically on a
    single writable connection (PRAGMA foreign_keys=ON, so ON DELETE CASCADE fires
    on purge); on apply failure the write rolls back but the token row remains
    pending, so the human can still approve it in Agent Actions.
    """
    mode = await get_permission_mode()
    if mode == READ_ONLY:
        raise WritesDisabledError(
            "BeatOS is in read-only mode; writes are disabled. "
            "Change it in Settings → AI Integration."
        )

    async with connect_writable() as conn:
        token = await create_token(conn, tool_name, payload)
        if mode == AUTO_APPROVE:
            result = await apply_token(conn, token)
            await conn.commit()
            return {"token": token, "status": "approved", "result": result}
        # confirm: leave the token pending for human approval.
        async with conn.execute(
            "SELECT expires_at FROM tokens WHERE token=?", (token,)
        ) as cur:
            row = await cur.fetchone()
    return {
        "token": token,
        "status": "awaiting_approval",
        "expires_at": row[0],
        "message": "Awaiting human approval. Open BeatOS → Agent Actions.",
    }
