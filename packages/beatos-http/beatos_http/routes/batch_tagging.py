"""Batch AI tagging (EPIC-D4d).

Runs the AI suggest-tags provider over a set of tracks and applies each
suggestion ONLY to fields that are currently empty (genre/mood/tags/description) —
never overwriting the producer's existing values. Scoped to explicitly selected
track ids so the number of paid provider calls is bounded by the user's choice.

Mirrors the batch-analysis job shape (start → poll). Per-track failures are
isolated and recorded (cause + count), never aborting the run; the API key is
never logged.
"""
from __future__ import annotations

import asyncio
import pathlib
import uuid

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from beatos_core.assets.service import get_asset
from beatos_core.tracks.service import get_track, update_track

from beatos_http.ai import service as ai_service
from beatos_http.api_auth import require_api_token

router = APIRouter(prefix="/api/ai", tags=["ai"])
log = structlog.get_logger(__name__)

_JOBS: dict[str, dict] = {}
_TASKS: set[asyncio.Task] = set()
_MAX_COVER_BYTES = 5 * 1024 * 1024
_MAX_ERROR_DETAILS = 10


class _BatchRequest(BaseModel):
    ids: list[int]


def _new_job(track_ids: list[int]) -> str:
    job_id = uuid.uuid4().hex
    _JOBS[job_id] = {
        "job_id": job_id,
        "total": len(track_ids),
        "done": 0,
        "current_title": None,
        "applied": 0,
        "errors": 0,
        "error_details": [],
        "status": "running",
    }
    return job_id


async def _load_cover(track) -> bytes | None:
    if track.cover_asset_id is None:
        return None
    asset = await get_asset(track.cover_asset_id)
    if asset is None or not asset.abs_path:
        return None
    try:
        data = pathlib.Path(asset.abs_path).read_bytes()
    except OSError:
        return None
    return data if 0 < len(data) <= _MAX_COVER_BYTES else None


async def _apply_to_empty(track, suggestion) -> bool:
    """Fill only the currently-empty fields. Returns True if anything changed."""
    patch: dict = {}
    if not track.genre and suggestion.genre:
        patch["genre"] = suggestion.genre
    if not track.mood and suggestion.mood:
        patch["mood"] = suggestion.mood
    if not track.tags and suggestion.tags:
        patch["tags"] = suggestion.tags
    if not track.description and suggestion.description:
        patch["description"] = suggestion.description
    if not patch:
        return False
    await update_track(track.id, patch)
    return True


async def _run_job(job_id: str, track_ids: list[int], provider) -> None:
    job = _JOBS[job_id]
    for tid in track_ids:
        track = await get_track(tid)
        job["current_title"] = track.title if track else None
        try:
            if track is not None:
                cover = await _load_cover(track)
                suggestion = await provider.suggest_tags(
                    title=track.title,
                    cover_png=cover,
                    existing={
                        "genre": track.genre or [],
                        "mood": track.mood or [],
                        "tags": track.tags or [],
                    },
                )
                if await _apply_to_empty(track, suggestion):
                    job["applied"] += 1
        except Exception as e:
            job["errors"] += 1
            title = track.title if track is not None else f"track {tid}"
            details = job["error_details"]
            details.append(f"{title}: {e}")
            del details[:-_MAX_ERROR_DETAILS]
            log.warning("batch_tagging.track_failed", track_id=tid, error=str(e))
        job["done"] += 1
    job["status"] = "done"
    job["current_title"] = None


@router.post("/suggest-tags/batch")
async def start_batch(req: _BatchRequest, _gate: None = Depends(require_api_token)) -> dict:
    # One paid provider call per id → token-gated (audit B5). No-op in web mode.
    provider = await ai_service.get_active_provider()
    if provider is None:
        raise HTTPException(409, "AI tagging is not enabled. Set it up in Settings → AI Assist.")
    job_id = _new_job(req.ids)
    task = asyncio.create_task(_run_job(job_id, req.ids, provider))
    _TASKS.add(task)
    task.add_done_callback(_TASKS.discard)
    return {"job_id": job_id, "total": len(req.ids)}


@router.get("/suggest-tags/batch/{job_id}")
async def batch_status(job_id: str) -> dict:
    job = _JOBS.get(job_id)
    if job is None:
        raise HTTPException(404, "job not found")
    return job
