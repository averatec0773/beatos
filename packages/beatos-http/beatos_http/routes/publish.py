"""HTTP facade for publishing. Pro-gated: returns 402 in the free build where the
private beatos-publish engine is absent. Lazy engine imports keep the module
importable without it."""
from __future__ import annotations

import asyncio
import mimetypes
import os

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import FileResponse

from beatos_http.api_auth import require_api_token
from beatos_http.pro import pro_available
from beatos_http.publish_schemas import (
    PublishLoginBody,
    PublishRequestBody,
    PublishValidateBody,
    TicketReportBody,
)

router = APIRouter(tags=["publish"])

_PRO_REQUIRED = "Publishing is a BeatOS Pro feature. Install the pro module to enable it."

# Hold strong refs to in-flight publish tasks so asyncio doesn't GC them mid-run.
_running: set = set()

# Each platform validity check launches its own headless browser. Bound how many
# run at once (B1) and serialize whole validate batches (B2) so a double-mount /
# button-spam / second window can't fan out 2N concurrent browsers in one spike.
_VALIDATE_CONCURRENCY = 3
_validate_lock = asyncio.Lock()


def _require_pro() -> None:
    if not pro_available():
        raise HTTPException(402, _PRO_REQUIRED)


@router.post("/api/publish")
async def create_publish(req: PublishRequestBody, request: Request) -> dict:
    # Token-gated (audit P20): starting a publish spawns a real browser and
    # uploads files — a local file:// page (which Electron CORS lets reach the
    # API) must not trigger it. No-op in web mode (same-origin, no token).
    require_api_token(request)
    _require_pro()
    from beatos_publish.jobs import REGISTRY
    from beatos_publish.models import PublishRequest
    from beatos_publish.platforms import available
    from beatos_publish.service import run_job

    if req.platform not in available():
        raise HTTPException(400, f"unknown platform {req.platform}")
    # auto_advance (NetEase multi-step flow) is intentionally NOT exposed on this
    # unauthenticated localhost body — any local process could otherwise trigger
    # it. Enable only via the BEATOS_PUBLISH_AUTO_ADVANCE=1 dev escape hatch.
    auto_advance = os.environ.get("BEATOS_PUBLISH_AUTO_ADVANCE") == "1"
    engine_req = PublishRequest(**req.model_dump(), auto_advance=auto_advance)
    if req.mode == "extension":
        # Extension mode stages a ticket (no browser task) — the extension side
        # panel claims it via /api/publish/tickets/*. Resolution failures (bad
        # track / missing asset / no recipe) fail the POST eagerly.
        from beatos_publish.errors import PublishError
        from beatos_publish.tickets import stage_ticket, upload_url
        try:
            ticket_id = await stage_ticket(engine_req)
        except (PublishError, ValueError) as e:
            raise HTTPException(400, str(e))
        # upload_url: the platform page the user opens in their own browser
        # (design §4 step 1 — the renderer offers it as a link).
        return {
            "job_id": ticket_id,
            "mode": "extension",
            "upload_url": upload_url(req.platform),
        }
    job_id = REGISTRY.create(engine_req)
    task = asyncio.create_task(run_job(job_id, engine_req))
    _running.add(task)
    task.add_done_callback(_running.discard)
    # Index by job_id so a DELETE of a live job can cancel it (audit P19).
    from beatos_http.publish_tasks import track
    track(job_id, task)
    return {"job_id": job_id}


@router.get("/api/publish/sessions")
async def publish_sessions() -> dict:
    _require_pro()
    from beatos_publish.platforms import available
    from beatos_publish.session import session_exists
    return {"sessions": {p: session_exists(p) for p in available()}}


@router.post("/api/publish/sessions/validate")
async def publish_sessions_validate(body: PublishValidateBody | None = None) -> dict:
    _require_pro()
    from beatos_publish.platforms import available
    from beatos_publish.service import validate_session
    known = available()
    requested = body.platforms if (body and body.platforms) else None
    platforms = [p for p in (requested or known) if p in known]

    sem = asyncio.Semaphore(_VALIDATE_CONCURRENCY)

    async def _check(platform: str) -> str:
        async with sem:
            return await validate_session(platform)

    # Each platform launches its own isolated headless browser (no shared state),
    # so validate them concurrently — wall-clock is the slowest single check, not
    # the sum across platforms — bounded by the semaphore and serialized as a batch.
    async with _validate_lock:
        results = await asyncio.gather(*(_check(p) for p in platforms))
    return {"sessions": dict(zip(platforms, results))}


@router.post("/api/publish/login")
async def publish_login_start(body: PublishLoginBody, request: Request) -> dict:
    # Token-gated (audit P20): opens a real headed browser for platform login.
    require_api_token(request)
    _require_pro()
    from beatos_publish.platforms import available
    if body.platform not in available():
        raise HTTPException(400, f"unknown platform {body.platform}")
    from beatos_http.publish_login import REGISTRY as LOGINS
    if LOGINS.is_active(body.platform):
        raise HTTPException(409, f"login already in progress for {body.platform}")
    login_id = LOGINS.start(body.platform, body.account or "default")
    return {"login_id": login_id}


@router.get("/api/publish/login/{login_id}")
async def publish_login_status(login_id: str) -> dict:
    _require_pro()
    from beatos_http.publish_login import REGISTRY as LOGINS
    t = LOGINS.get(login_id)
    if t is None:
        raise HTTPException(404, "login task not found")
    return {"status": t.status, "message": t.message}


@router.get("/api/publish/jobs")
async def publish_jobs() -> dict:
    _require_pro()
    from beatos_publish.jobs import REGISTRY
    return {"jobs": [j.model_dump(mode="json") for j in REGISTRY.all()]}


# Clear-all must precede the /{job_id} catch-all so DELETE /api/publish/jobs
# isn't captured as job_id="jobs".
@router.delete("/api/publish/jobs")
async def publish_clear_jobs(request: Request) -> dict:
    # Token-gated (audit P20): cancels live browsers + wipes publish history.
    require_api_token(request)
    _require_pro()
    from beatos_publish.jobs import REGISTRY
    # Cancel any live browser runs before dropping the records, so "Clear all"
    # doesn't leave orphaned browsers driving in the background (audit P19).
    from beatos_http.publish_tasks import cancel
    cancelled = sum(cancel(j.job_id) for j in REGISTRY.all())
    # Extension tickets: every capability asset URL dies with its job row.
    from beatos_publish.tickets import invalidate_all
    invalidate_all()
    return {"deleted": REGISTRY.clear(), "cancelled": cancelled}


# --- Extension tickets (2026-08-01 design). Declared BEFORE the /{job_id}
# catch-all (see the NOTE below — ordering is load-bearing). Reads are open
# (panel polling); claim/report mutate ticket state and are token-gated like
# every other mutating publish route (P20).

@router.get("/api/publish/tickets/pending")
async def publish_tickets_pending(platform: str | None = None) -> dict:
    _require_pro()
    from beatos_publish.tickets import pending_tickets
    return {"tickets": pending_tickets(platform)}


@router.post("/api/publish/tickets/{job_id}/claim")
async def publish_ticket_claim(job_id: str, request: Request) -> dict:
    require_api_token(request)
    _require_pro()
    from beatos_publish.errors import PublishError
    from beatos_publish.tickets import claim_ticket
    try:
        return await claim_ticket(job_id)
    except KeyError:
        raise HTTPException(404, "job not found")
    except ValueError as e:
        raise HTTPException(409, str(e))
    except PublishError as e:
        # Claim re-resolves export + assets; a since-deleted asset fails here.
        raise HTTPException(409, str(e))


@router.post("/api/publish/tickets/{job_id}/report")
async def publish_ticket_report(job_id: str, body: TicketReportBody, request: Request) -> dict:
    require_api_token(request)
    _require_pro()
    from beatos_publish.tickets import report_ticket
    try:
        report_ticket(job_id, body.stage, body.message, body.reports)
    except KeyError:
        raise HTTPException(404, "job not found")
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


# CORS on the asset-streaming route ONLY (capability-URL model, design §8): the
# extension content script fetches asset bytes from a platform page origin, so
# this one route answers cross-origin. Access control is the per-claim
# unguessable nonce in the path — ticket-scoped, regenerated on re-claim, dead
# once the ticket is terminal or deleted. The main API is an open localhost read
# surface anyway; the nonce is required precisely so platform-page scripts can't
# enumerate assets. Deliberately NOT token-gated — page contexts can't carry the
# Authorization header without a preflight, and the nonce already gates access.
_ASSET_CORS = {"Access-Control-Allow-Origin": "*"}


@router.options("/api/publish/tickets/{job_id}/assets/{asset_id}/{nonce}")
async def publish_ticket_asset_preflight(job_id: str, asset_id: int, nonce: str) -> Response:
    # A simple GET needs no preflight, but answer one anyway (belt-and-braces
    # for fetch wrappers that add innocuous options).
    return Response(
        status_code=204,
        headers={**_ASSET_CORS, "Access-Control-Allow-Methods": "GET, OPTIONS"},
    )


@router.get("/api/publish/tickets/{job_id}/assets/{asset_id}/{nonce}")
async def publish_ticket_asset(job_id: str, asset_id: int, nonce: str) -> FileResponse:
    _require_pro()
    from beatos_publish.tickets import _TERMINAL_STAGES, ticket_asset_path
    from beatos_publish.jobs import REGISTRY
    job = REGISTRY.get(job_id)
    if job is None:
        raise HTTPException(404, "job not found", headers=_ASSET_CORS)
    if job.stage in _TERMINAL_STAGES:
        # Gone, not Not-Found: the ticket existed but its asset URLs expired
        # with it — tells a live panel to stop retrying.
        raise HTTPException(410, "ticket is terminal — asset links expired", headers=_ASSET_CORS)
    try:
        path = ticket_asset_path(job_id, asset_id, nonce)
    except KeyError:
        # Unknown asset and nonce mismatch are indistinguishable on purpose.
        raise HTTPException(404, "asset not found", headers=_ASSET_CORS)
    if not os.path.isfile(path):
        # The catalog row exists but the bytes don't (offline/unmounted drive —
        # dogfood found a whole missing volume). Name the file so the panel can
        # tell the user exactly what to remount.
        raise HTTPException(
            404,
            f"asset file missing on disk: {os.path.basename(path)} "
            "(is the drive it lives on mounted?)",
            headers=_ASSET_CORS,
        )
    media_type = mimetypes.guess_type(path)[0] or "application/octet-stream"
    # FileResponse stats the file → correct Content-Length; streams the body.
    return FileResponse(path, media_type=media_type, headers=_ASSET_CORS)


@router.delete("/api/publish/{job_id}", status_code=204)
async def publish_delete_job(job_id: str, request: Request) -> Response:
    # Token-gated (audit P20): cancels the live browser run + drops the record.
    require_api_token(request)
    _require_pro()
    from beatos_publish.jobs import REGISTRY
    # Cancel the live browser run (if any) — unwinds browser_context, closes the
    # window — THEN drop the record (audit P19).
    from beatos_http.publish_tasks import cancel
    cancel(job_id)
    # Extension tickets: deleting the job kills its capability asset URLs (and
    # merged field reports) — nothing outlives the row (design §8).
    from beatos_publish.tickets import invalidate_ticket
    invalidate_ticket(job_id)
    if not REGISTRY.delete(job_id):
        raise HTTPException(404, "job not found")
    return Response(status_code=204)


# NOTE: keep this catch-all LAST — it matches any /api/publish/<x>, so every
# literal /api/publish/... route (sessions, sessions/validate, login, jobs,
# tickets/*) must be declared above it or it will shadow them (→ 404 "job not
# found").
@router.get("/api/publish/{job_id}")
async def publish_status(job_id: str) -> dict:
    _require_pro()
    from beatos_publish.jobs import REGISTRY
    job = REGISTRY.get(job_id)
    if job is None:
        raise HTTPException(404, "job not found")
    out = job.model_dump()
    # Extension tickets carry cumulative per-field fill reports; engine jobs keep
    # the response shape unchanged. mode defaults to "engine" for legacy rows.
    if getattr(job.request, "mode", "engine") == "extension":
        from beatos_publish.tickets import ticket_reports
        out["field_reports"] = ticket_reports(job_id)
    return out
