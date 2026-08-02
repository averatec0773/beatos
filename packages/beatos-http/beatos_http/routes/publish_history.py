"""Durable publish-history routes (P4).

NOT pro-gated, deliberately: history is catalog data, and a free build (no
`packages/pro`) must still be able to read what was published in a Pro build.
This module imports only `beatos_core` — nothing here touches the engine.

REGISTRATION ORDER IS LOAD-BEARING: `routes/publish.py` ends with a catch-all
``GET /api/publish/{job_id}``, which matches ``/api/publish/history``. This
router must be included in `app.py` BEFORE `publish.router`, or the list
endpoint is shadowed (404 "job not found", or 402 in a free build).

Endpoints
---------
- GET  /api/publish/history?track_id=&limit=&include_hidden=  → {"attempts": [...]}
- GET  /api/publish/history/{attempt_id}   → {"attempt": {...}, "field_reports": [...]}
- POST /api/publish/history/{attempt_id}/hide → {"ok": true}   (token-gated)
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from beatos_core.publish_history.service import get_attempt, list_attempts, set_hidden
from beatos_http.api_auth import require_api_token

router = APIRouter(tags=["publish-history"])


class HideBody(BaseModel):
    hidden: bool = True


@router.get("/api/publish/history")
async def publish_history(
    track_id: int | None = None,
    limit: int = Query(50, ge=1, le=500),
    include_hidden: bool = False,
) -> dict:
    attempts = await list_attempts(
        track_id=track_id, limit=limit, include_hidden=include_hidden
    )
    return {"attempts": attempts}


@router.get("/api/publish/history/{attempt_id}")
async def publish_history_detail(attempt_id: int) -> dict:
    attempt = await get_attempt(attempt_id)
    if attempt is None:
        raise HTTPException(404, "attempt not found")
    field_reports = attempt.pop("field_reports", [])
    return {"attempt": attempt, "field_reports": field_reports}


@router.post("/api/publish/history/{attempt_id}/hide")
async def publish_history_hide(
    attempt_id: int, body: HideBody, request: Request
) -> dict:
    # Token-gated: mutating, same rule as every other mutating publish route.
    require_api_token(request)
    if not await set_hidden(attempt_id, body.hidden):
        raise HTTPException(404, "attempt not found")
    return {"ok": True}
