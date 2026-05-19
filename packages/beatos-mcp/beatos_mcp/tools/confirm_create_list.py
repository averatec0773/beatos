"""confirm_create_list MCP tool — read-only status check for a create_list token.

Phase 2 of two-phase commit (read-only side). The actual write happens at
Approve time in BeatOS; this tool only reports the outcome to the AI."""
from __future__ import annotations

from beatos_core.two_phase import TokenError, get_token_status

from beatos_mcp.db import connect


async def confirm_create_list(token: str) -> dict:
    if not isinstance(token, str) or not token:
        raise ValueError("token is required")

    async with connect() as conn:
        try:
            info = await get_token_status(conn, token)
        except TokenError as e:
            raise ValueError(str(e)) from e

    if info["tool_name"] != "create_list":
        raise ValueError(
            f"token is not a create_list token (tool={info['tool_name']})"
        )

    status = info["status"]
    if status == "pending":
        return {"status": "awaiting_approval", "expires_at": info["expires_at"]}
    if status == "consumed":
        return {
            "status": "approved",
            "list_id": info["result"]["list_id"],
            "name": info["payload"]["name"],
        }
    if status == "rejected":
        return {"status": "rejected"}
    if status == "expired":
        return {"status": "expired"}
    raise ValueError(f"unexpected token status: {status}")
