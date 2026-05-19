"""create_list MCP write tool — issues 2PC token, does not write list table.

Phase 1 of two-phase commit. The actual INSERT into the list table happens
when the user clicks Approve in BeatOS Settings → AI Integration → Pending
confirmations (routed through POST /api/tokens/{t}/approve in beatos-http).

AI can call await_approval(token) to read the eventual outcome."""
from __future__ import annotations

from beatos_core.two_phase import create_token

from beatos_mcp.db import connect_writable

_MAX_NAME_LEN = 200


async def create_list(name: str) -> dict:
    if not isinstance(name, str):
        raise ValueError("name must be a string")
    if not name.strip():
        raise ValueError("name must not be empty")
    if len(name) > _MAX_NAME_LEN:
        raise ValueError(f"name must be at most {_MAX_NAME_LEN} characters")

    async with connect_writable() as conn:
        token = await create_token(
            conn,
            tool_name="create_list",
            payload={"name": name},
        )
        async with conn.execute(
            "SELECT expires_at FROM tokens WHERE token=?", (token,)
        ) as cur:
            row = await cur.fetchone()
        expires_at = row[0]

    return {
        "token": token,
        "expires_at": expires_at,
        "message": (
            "Awaiting human approval. Open BeatOS → Settings → AI Integration "
            "→ Pending confirmations, and click Approve. You can call "
            "await_approval(token) to check status."
        ),
    }
