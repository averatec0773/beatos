"""GET /api/agent-actions — read-only audit log of agent write actions.

Backs the in-app dashboard (replaces the 2PC Approvals panel). Read-only: writes
apply directly under client consent (L1); this endpoint just reports what happened.
"""
from __future__ import annotations

import aiosqlite
from fastapi import APIRouter

from beatos_core.agent_log import list_agent_actions
from beatos_core.db import resolve_db_path

router = APIRouter(prefix="/api/agent-actions", tags=["agent-actions"])


@router.get("")
async def get_agent_actions(limit: int = 100) -> dict:
    async with aiosqlite.connect(str(resolve_db_path())) as conn:
        return {"actions": await list_agent_actions(conn, limit=limit)}
