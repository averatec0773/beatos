"""/api/ai — in-app AI tagging status (EPIC-D4a).

Read-only status for now (provider, whether a key is set, whether enabled). The
key is written through PUT /api/app_settings/ai_api_key (write-gated + secret);
the suggest-tags action lands in a later sub-task.
"""
from __future__ import annotations

from fastapi import APIRouter

from beatos_http.ai.service import get_ai_status

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.get("/status")
async def status() -> dict:
    return await get_ai_status()
