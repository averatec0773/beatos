"""Pro-gated direct-apply handler for publish_track.

Registered only when the beatos-publish engine is present, so in the free build
the publish_track tool isn't offered and this handler never registers. The MCP
publish_track tool routes every call through `submit_write` — dry-run included —
so this handler runs for both; the dry_run flag rides inside the request payload
and the engine decides how far to take the job. It starts the publish job — a
fire-and-forget browser run — and returns the job_id. The engine is lazy-imported
inside the handler so this module imports cleanly in the free build too.
"""
from __future__ import annotations

import asyncio

import aiosqlite

from beatos_core.approvals import register_apply_handler as register_approve_handler
from beatos_http.pro import pro_available

# Strong refs to in-flight publish tasks — asyncio holds only weak refs, so a
# fire-and-forget create_task() could be GC'd mid-run. Discarded on completion.
_publish_tasks: set = set()


if pro_available():

    @register_approve_handler("publish_track")
    async def _apply_publish_track(conn: aiosqlite.Connection, payload: dict) -> dict:
        req_data = payload["request"]

        from beatos_publish.jobs import REGISTRY
        from beatos_publish.models import PublishRequest
        from beatos_publish.service import run_job

        req = PublishRequest(**req_data)
        job_id = REGISTRY.create(req)
        task = asyncio.create_task(run_job(job_id, req))
        _publish_tasks.add(task)
        task.add_done_callback(_publish_tasks.discard)

        return {
            "job_id": job_id,
            "status": "started",
            "note": "Publish started in a browser; a human must finish at the "
                    "platform's verification gate. Poll publish_status(job_id). "
                    "Do not retry on timeout.",
        }
