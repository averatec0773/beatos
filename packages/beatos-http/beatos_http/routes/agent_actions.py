"""GET /api/agent-actions — read-only audit log of agent write actions.

Backs the in-app dashboard (replaces the 2PC Approvals panel). Read-only: writes
apply directly under client consent (L1); this endpoint just reports what happened.
"""
from __future__ import annotations

import aiosqlite
from fastapi import APIRouter, HTTPException, Request, Response

from beatos_core.agent_log import (
    clear_agent_actions,
    delete_agent_action,
    list_agent_actions,
)
from beatos_core.db import connect_writable, resolve_db_path
from beatos_http.api_auth import require_api_token

router = APIRouter(prefix="/api/agent-actions", tags=["agent-actions"])


@router.get("")
async def get_agent_actions(limit: int = 100) -> dict:
    async with aiosqlite.connect(str(resolve_db_path())) as conn:
        return {"actions": await list_agent_actions(conn, limit=limit)}


@router.delete("/{action_id}", status_code=204)
async def delete_agent_action_route(action_id: int, request: Request) -> Response:
    """Remove one audit-log entry (user history cleanup). Token-gated: the audit
    trail is the accountability record for agent writes, so a local file:// page
    (which Electron's CORS lets reach the API) must not be able to erase it."""
    require_api_token(request)
    async with connect_writable() as conn:
        deleted = await delete_agent_action(conn, action_id)
        await conn.commit()
    if not deleted:
        raise HTTPException(status_code=404, detail="action not found")
    return Response(status_code=204)


@router.delete("")
async def clear_agent_actions_route(request: Request) -> dict:
    """Clear the entire audit log. Token-gated — see delete_agent_action_route."""
    require_api_token(request)
    async with connect_writable() as conn:
        deleted = await clear_agent_actions(conn)
        await conn.commit()
    return {"deleted": deleted}
