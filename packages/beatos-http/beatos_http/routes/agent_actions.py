"""GET /api/agent-actions — read-only audit log of agent write actions.

Backs the in-app dashboard (replaces the 2PC Approvals panel). Read-only: writes
apply directly under client consent (L1); this endpoint just reports what happened.
"""
from __future__ import annotations

import aiosqlite
from fastapi import APIRouter, HTTPException, Response

from beatos_core.agent_log import (
    clear_agent_actions,
    delete_agent_action,
    list_agent_actions,
)
from beatos_core.db import connect_writable, resolve_db_path

router = APIRouter(prefix="/api/agent-actions", tags=["agent-actions"])


@router.get("")
async def get_agent_actions(limit: int = 100) -> dict:
    async with aiosqlite.connect(str(resolve_db_path())) as conn:
        return {"actions": await list_agent_actions(conn, limit=limit)}


@router.delete("/{action_id}", status_code=204)
async def delete_agent_action_route(action_id: int) -> Response:
    """Remove one audit-log entry (user history cleanup)."""
    async with connect_writable() as conn:
        deleted = await delete_agent_action(conn, action_id)
        await conn.commit()
    if not deleted:
        raise HTTPException(status_code=404, detail="action not found")
    return Response(status_code=204)


@router.delete("")
async def clear_agent_actions_route() -> dict:
    """Clear the entire audit log."""
    async with connect_writable() as conn:
        deleted = await clear_agent_actions(conn)
        await conn.commit()
    return {"deleted": deleted}
