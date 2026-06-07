"""Pro-gated 2PC apply handler for publish_track.

Registered only when the beatos-publish engine is present, so in the free build
the publish_track tool isn't offered and this handler never registers. On
approval (human in `confirm` mode, or the policy in `auto_approve`), it starts the
publish job — a fire-and-forget browser run — and consumes the token with the
job_id. The engine is lazy-imported inside the handler so this module imports
cleanly in the free build too.
"""
from __future__ import annotations

import asyncio

import aiosqlite

from beatos_core.two_phase import consume_token_with_result, verify_token
from beatos_http.pro import pro_available
from beatos_http.routes.tokens import register_approve_handler

# Strong refs to in-flight publish tasks — asyncio holds only weak refs, so a
# fire-and-forget create_task() could be GC'd mid-run. Discarded on completion.
_publish_tasks: set = set()


if pro_available():

    @register_approve_handler("publish_track")
    async def _apply_publish_track(conn: aiosqlite.Connection, token: str) -> dict:
        payload = await verify_token(conn, token, expected_tool="publish_track")
        req_data = payload["request"]

        from beatos_publish.jobs import REGISTRY
        from beatos_publish.models import PublishRequest
        from beatos_publish.service import run_job

        req = PublishRequest(**req_data)
        job_id = REGISTRY.create(req)
        task = asyncio.create_task(run_job(job_id, req))
        _publish_tasks.add(task)
        task.add_done_callback(_publish_tasks.discard)

        result = {
            "job_id": job_id,
            "status": "started",
            "note": "Publish started in a browser; a human must finish at the "
                    "platform's verification gate. Poll publish_status(job_id). "
                    "Do not retry on timeout.",
        }
        await consume_token_with_result(conn, token, result)
        return result
