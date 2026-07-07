from __future__ import annotations

import asyncio
import uuid

import aiosqlite
import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from beatos_core.audio_analysis.constants import (
    BPM_AUTOFILL_CONFIDENCE,
    KEY_AUTOFILL_CONFIDENCE,
)
from beatos_core.audio_analysis.select import pick_audio_asset
from beatos_core.audio_analysis.service import analyze_asset
from beatos_core.assets.service import list_assets_for_track
from beatos_core.db import resolve_db_path
from beatos_core.tracks.service import count_unanalyzed, get_track

router = APIRouter(tags=["batch-analysis"])

log = structlog.get_logger(__name__)

_JOBS: dict[str, dict] = {}
_TASKS: set[asyncio.Task] = set()

# Cap retained per-job error messages so a long failing batch can't grow the
# in-memory job dict unbounded; the `errors` counter still reflects the true total.
_MAX_ERROR_DETAILS = 10


def _new_job(track_ids: list[int]) -> str:
    job_id = uuid.uuid4().hex
    _JOBS[job_id] = {
        "job_id": job_id, "total": len(track_ids), "done": 0,
        "current_title": None, "filled_bpm": 0, "filled_key": 0,
        "errors": 0, "error_details": [], "status": "running",
    }
    return job_id


async def _autofill(track, result, job) -> None:
    sets: list[str] = []
    params: list = []
    if track.bpm is None and result.bpm is not None and (result.bpm_confidence or 0) >= BPM_AUTOFILL_CONFIDENCE:
        sets.append("bpm=?")
        params.append(int(result.bpm))
        job["filled_bpm"] += 1
    if not track.key_signature and result.key and (result.key_confidence or 0) >= KEY_AUTOFILL_CONFIDENCE:
        sets.append("key_signature=?")
        params.append(result.key)
        job["filled_key"] += 1
    if not sets:
        return
    params.append(track.id)
    async with aiosqlite.connect(resolve_db_path()) as conn:
        await conn.execute(f"UPDATE track SET {', '.join(sets)} WHERE id=?", params)
        await conn.commit()


async def _run_job(job_id: str, track_ids: list[int]) -> None:
    job = _JOBS[job_id]
    for tid in track_ids:
        track = await get_track(tid)
        job["current_title"] = track.title if track else None
        try:
            if track is not None:
                asset = pick_audio_asset(await list_assets_for_track(tid))
                if asset is not None:
                    result = await analyze_asset(asset.id)
                    if result is not None:
                        await _autofill(track, result, job)
        except Exception as e:
            job["errors"] += 1
            title = track.title if track is not None else f"track {tid}"
            details = job["error_details"]
            details.append(f"{title}: {e}")
            del details[:-_MAX_ERROR_DETAILS]
            log.warning("batch_analysis.track_failed", track_id=tid, error=str(e))
        job["done"] += 1
    job["status"] = "done"
    job["current_title"] = None


class _BatchRequest(BaseModel):
    scope: str
    ids: list[int] | None = None


@router.get("/api/tracks/unanalyzed/count")
async def unanalyzed_count() -> dict:
    return {"count": await count_unanalyzed()}


async def _unanalyzed_ids() -> list[int]:
    async with aiosqlite.connect(resolve_db_path()) as conn:
        async with conn.execute(
            "SELECT t.id FROM track t WHERE t.deleted_at IS NULL AND t.bpm IS NULL "
            "AND EXISTS (SELECT 1 FROM asset a WHERE a.track_id=t.id "
            "AND a.missing=0 AND a.role LIKE 'audio%') ORDER BY t.id"
        ) as cur:
            return [r[0] for r in await cur.fetchall()]


@router.post("/api/analysis/batch")
async def start_batch(req: _BatchRequest) -> dict:
    if req.scope == "selected":
        ids = req.ids or []
    elif req.scope == "unanalyzed":
        ids = await _unanalyzed_ids()
    else:
        raise HTTPException(400, "scope must be 'selected' or 'unanalyzed'")
    job_id = _new_job(ids)
    task = asyncio.create_task(_run_job(job_id, ids))
    _TASKS.add(task)
    task.add_done_callback(_TASKS.discard)
    return {"job_id": job_id, "total": len(ids)}


@router.get("/api/analysis/batch/{job_id}")
async def batch_status(job_id: str) -> dict:
    job = _JOBS.get(job_id)
    if job is None:
        raise HTTPException(404, "job not found")
    return job
