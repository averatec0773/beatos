"""Periodic sweep — checks for missing files across the global catalog."""
from __future__ import annotations

from fastapi import APIRouter

from beatos_core.assets.service import missing_sweep

router = APIRouter(prefix="/api/sweep", tags=["sweep"])


@router.post("/assets")
async def sweep_assets() -> dict[str, int]:
    return await missing_sweep()
