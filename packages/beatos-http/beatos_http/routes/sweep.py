"""Periodic sweep — checks for missing files across the active library."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from beatos_core import state
from beatos_core.assets.service import missing_sweep

router = APIRouter(prefix="/api/sweep", tags=["sweep"])


@router.post("/assets")
async def sweep_assets() -> dict[str, int]:
    if state.get_active() is None:
        raise HTTPException(status_code=409, detail="No active library.")
    return await missing_sweep()
