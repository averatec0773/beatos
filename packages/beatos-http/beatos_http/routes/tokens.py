"""/api/tokens routes — 2PC write-tool surface (list, approve, reject, SSE)."""
from __future__ import annotations

import json
from typing import Literal

import aiosqlite
from fastapi import APIRouter, Query

from beatos_core.db import resolve_db_path

router = APIRouter(prefix="/api/tokens", tags=["tokens"])


@router.get("")
async def list_tokens(
    status: Literal["pending"] = Query("pending"),
) -> list[dict]:
    """List tokens by status. Currently only 'pending' is exposed."""
    async with aiosqlite.connect(resolve_db_path()) as conn:
        async with conn.execute(
            "SELECT token, tool_name, payload, created_at, expires_at "
            "FROM tokens WHERE status=? ORDER BY created_at ASC",
            (status,),
        ) as cur:
            rows = await cur.fetchall()
    return [
        {
            "token": r[0],
            "tool_name": r[1],
            "payload": json.loads(r[2]),
            "created_at": r[3],
            "expires_at": r[4],
        }
        for r in rows
    ]
