from __future__ import annotations

from beatos_core.export.service import available_platforms, export_metadata as _export


async def list_export_platforms() -> dict:
    return {"platforms": available_platforms()}


async def export_metadata(track_id: int, platform: str) -> dict:
    result = await _export(track_id, platform)
    return result.model_dump()
