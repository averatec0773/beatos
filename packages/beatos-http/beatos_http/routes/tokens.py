"""/api/tokens routes — 2PC write-tool surface (list, approve, reject, SSE)."""
from __future__ import annotations

import asyncio
import datetime as _dt
import json
from typing import Literal

import aiosqlite
from fastapi import APIRouter, HTTPException, Query, Request
from sse_starlette.sse import EventSourceResponse

from beatos_http.api_auth import require_api_token

from beatos_core.approvals import (
    ApplyHandlerNotFound,
    apply_token,
    register_apply_handler as register_approve_handler,
    _APPLY_HANDLERS as _APPROVE_HANDLERS,
)
from beatos_core.db import resolve_db_path
from beatos_core.two_phase import (
    RowVanishedError,
    TokenError,
    consume_token_with_result,
    reject_token as _reject_token,
    verify_token,
)

router = APIRouter(prefix="/api/tokens", tags=["tokens"])

# The 2PC apply registry + dispatcher now live in beatos_core.approvals so the
# MCP auto-approve path can share them (see that module). `register_approve_handler`
# and `_APPROVE_HANDLERS` are re-exported above for back-compat: handler modules and
# tests import them from here unchanged; they register into the core registry.


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


@router.get("/stream")
async def token_stream():
    """SSE stream — emits 'pending_changed' whenever the set of pending tokens
    changes. Payload carries only count; clients re-GET /api/tokens?status=pending
    for details. Internal implementation polls SQLite every 1 second."""
    db = resolve_db_path()

    async def event_gen():
        last_pending: set[str] = set()
        emitted_initial = False
        while True:
            async with aiosqlite.connect(db) as conn:
                async with conn.execute(
                    "SELECT token FROM tokens WHERE status='pending'"
                ) as cur:
                    rows = await cur.fetchall()
            current = {r[0] for r in rows}
            if not emitted_initial or current != last_pending:
                yield {
                    "event": "pending_changed",
                    "data": json.dumps({"count": len(current)}),
                }
                last_pending = current
                emitted_initial = True
            await asyncio.sleep(1.0)

    return EventSourceResponse(event_gen())


@router.post("/{token}/approve")
async def approve_token(token: str, request: Request) -> dict:
    # Approving a pending write IS the human-in-the-loop gate — guard it like the
    # agent_permission_mode flip (no-op when no local token is configured).
    require_api_token(request)
    async with aiosqlite.connect(resolve_db_path(), timeout=5) as conn:
        # SQLite ships with FK enforcement OFF per-connection. Enable it here
        # so every ON DELETE CASCADE (asset→track, track_list→track,
        # analysis_cache→asset) actually fires when handlers DELETE FROM track.
        await conn.execute("PRAGMA foreign_keys=ON")
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

        try:
            result = await apply_token(conn, token)
            await conn.commit()
        except ApplyHandlerNotFound:
            await conn.rollback()
            raise HTTPException(
                status_code=400, detail=f"Unknown tool for approve: {tool_name}"
            )
        except TokenError as e:
            await conn.rollback()
            raise HTTPException(status_code=409, detail=str(e))
        except RowVanishedError as e:
            await conn.rollback()
            raise HTTPException(status_code=409, detail=str(e))
        except Exception:
            await conn.rollback()
            raise
        return result


@router.post("/{token}/reject")
async def reject_endpoint(token: str, request: Request) -> dict:
    """Mark a pending token rejected. No-op on already-terminal tokens
    (race tolerance). 404 if token doesn't exist."""
    require_api_token(request)
    async with aiosqlite.connect(resolve_db_path()) as conn:
        async with conn.execute(
            "SELECT 1 FROM tokens WHERE token=?", (token,)
        ) as cur:
            row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Token not found")
        await _reject_token(conn, token)
    return {"ok": True}


@router.get("")
async def list_tokens(
    status: Literal["pending", "history"] = Query("pending"),
) -> list[dict]:
    """List tokens by status.
    - `pending`: open tokens awaiting user approval.
    - `history`: terminal (consumed/rejected/expired) tokens from the last 24h,
      most recent first. Includes status + consumed_at + result.
    """
    import time as _time

    async with aiosqlite.connect(resolve_db_path()) as conn:
        if status == "pending":
            async with conn.execute(
                "SELECT token, tool_name, payload, created_at, expires_at "
                "FROM tokens WHERE status='pending' ORDER BY created_at ASC",
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
        # status == "history"
        cutoff = _time.time() - 86400
        async with conn.execute(
            "SELECT token, tool_name, payload, created_at, expires_at, "
            "status, consumed_at, result "
            "FROM tokens "
            "WHERE status IN ('consumed', 'rejected', 'expired') "
            "AND COALESCE(consumed_at, expires_at) > ? "
            "ORDER BY COALESCE(consumed_at, expires_at) DESC",
            (cutoff,),
        ) as cur:
            rows = await cur.fetchall()
        return [
            {
                "token": r[0],
                "tool_name": r[1],
                "payload": json.loads(r[2]),
                "created_at": r[3],
                "expires_at": r[4],
                "status": r[5],
                "consumed_at": r[6],
                "result": json.loads(r[7]) if r[7] else None,
            }
            for r in rows
        ]


# Side-effect import: registers @register_approve_handler for every batch tool.
from beatos_http import handlers  # noqa: E402, F401
