"""/api/tokens routes — 2PC write-tool surface (list, approve, reject, SSE)."""
from __future__ import annotations

import datetime as _dt
import json
from typing import Awaitable, Callable, Literal

import aiosqlite
from fastapi import APIRouter, HTTPException, Query

from beatos_core.db import resolve_db_path
from beatos_core.two_phase import (
    TokenError,
    consume_token_with_result,
    verify_token,
)

router = APIRouter(prefix="/api/tokens", tags=["tokens"])


_APPROVE_HANDLERS: dict[str, Callable[[aiosqlite.Connection, str], Awaitable[dict]]] = {}


def register_approve_handler(tool_name: str):
    def decorator(fn):
        _APPROVE_HANDLERS[tool_name] = fn
        return fn
    return decorator


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


@register_approve_handler("create_list")
async def _approve_create_list(conn: aiosqlite.Connection, token: str) -> dict:
    payload = await verify_token(conn, token, expected_tool="create_list")
    name = payload["name"]
    cur = await conn.execute(
        "INSERT INTO list (name, kind, position, created_at) VALUES (?, 'user', 0, ?)",
        (name, _now()),
    )
    list_id = cur.lastrowid
    await consume_token_with_result(conn, token, {"list_id": list_id})
    return {"list_id": list_id, "name": name}


@router.post("/{token}/approve")
async def approve_token(token: str) -> dict:
    async with aiosqlite.connect(resolve_db_path()) as conn:
        async with conn.execute(
            "SELECT tool_name, status FROM tokens WHERE token=?", (token,)
        ) as cur:
            row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Token not found")
        tool_name, status = row
        if status != "pending":
            raise HTTPException(
                status_code=409, detail=f"Token not in pending state: {status}"
            )
        handler = _APPROVE_HANDLERS.get(tool_name)
        if not handler:
            raise HTTPException(
                status_code=400, detail=f"Unknown tool for approve: {tool_name}"
            )

        await conn.execute("BEGIN")
        try:
            result = await handler(conn, token)
            await conn.commit()
        except TokenError as e:
            await conn.rollback()
            raise HTTPException(status_code=409, detail=str(e))
        except Exception:
            await conn.rollback()
            raise
        return result


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
