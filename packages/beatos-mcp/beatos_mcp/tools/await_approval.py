"""await_approval — polls the status of any 2PC token issued by a write tool.

Returns a normalized envelope. On approved tokens, the stored `result` JSON
is decoded and merged into the response under a `result` key. Tool-specific
result shapes are documented in the design spec; this impl is intentionally
tool-agnostic.
"""
from __future__ import annotations

import json

import aiosqlite

from beatos_mcp.db import connect


async def await_approval(token: str) -> dict:
    if not isinstance(token, str) or not token:
        raise ValueError("token must be a non-empty string")

    async with connect() as conn:
        async with conn.execute(
            "SELECT tool_name, status, result, expires_at FROM tokens WHERE token=?",
            (token,),
        ) as cur:
            row = await cur.fetchone()

    if row is None:
        return {"status": "not_found", "token": token}

    tool_name, status, result_json, expires_at = row
    envelope: dict = {"token": token, "tool_name": tool_name, "status": status}

    if status == "pending":
        envelope["status"] = "awaiting_approval"
        envelope["expires_at"] = expires_at
        return envelope

    if status == "consumed":
        envelope["status"] = "approved"
        envelope["result"] = json.loads(result_json) if result_json else {}
        return envelope

    # rejected / expired
    return envelope
