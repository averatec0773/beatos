"""HTTP facade for publishing. Pro-gated: returns 402 in the free build where the
private beatos-publish engine is absent. Lazy engine imports keep the module
importable without it."""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException

from beatos_http.pro import pro_available
from beatos_http.publish_schemas import PublishRequestBody

router = APIRouter(tags=["publish"])

_PRO_REQUIRED = "Publishing is a BeatOS Pro feature. Install the pro module to enable it."

# Hold strong refs to in-flight publish tasks so asyncio doesn't GC them mid-run.
_running: set = set()


def _require_pro() -> None:
    if not pro_available():
        raise HTTPException(402, _PRO_REQUIRED)


@router.post("/api/publish")
async def create_publish(req: PublishRequestBody) -> dict:
    _require_pro()
    from beatos_publish.jobs import REGISTRY
    from beatos_publish.models import PublishRequest
    from beatos_publish.platforms import available
    from beatos_publish.service import run_job

    if req.platform not in available():
        raise HTTPException(400, f"unknown platform {req.platform}")
    engine_req = PublishRequest(**req.model_dump())
    job_id = REGISTRY.create(engine_req)
    task = asyncio.create_task(run_job(job_id, engine_req))
    _running.add(task)
    task.add_done_callback(_running.discard)
    return {"job_id": job_id}


@router.get("/api/publish/sessions")
async def publish_sessions() -> dict:
    _require_pro()
    from beatos_publish.platforms import available
    from beatos_publish.session import session_exists
    return {"sessions": {p: session_exists(p) for p in available()}}


@router.get("/api/publish/{job_id}")
async def publish_status(job_id: str) -> dict:
    _require_pro()
    from beatos_publish.jobs import REGISTRY
    job = REGISTRY.get(job_id)
    if job is None:
        raise HTTPException(404, "job not found")
    return job.model_dump()
