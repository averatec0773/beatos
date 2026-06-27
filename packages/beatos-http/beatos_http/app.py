"""FastAPI application factory.

Lifespan wiring (v0.0.4):
- Run DB migrations on startup.
v0.0.23: Mount FastMCP app and manage its lifespan.
"""
from __future__ import annotations

import asyncio
import logging
import os
import pathlib
import socket
from contextlib import asynccontextmanager
from typing import Optional

import aiosqlite
import structlog
from asgi_correlation_id import CorrelationIdMiddleware
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from beatos_core.db import resolve_db_path, run_migrations
from beatos_http import __version__
from beatos_http.seed.demo import seed_demo_if_needed
from beatos_http.mcp_auth import get_mcp_token, guard_mcp_app
from beatos_http.routes import (
    agent_actions,
    ai,
    analysis,
    app_settings,
    assets,
    batch_analysis,
    batch_tagging,
    bulk,
    export,
    fs,
    inject,
    license_pdf,
    licenses,
    lists,
    pro,
    producers,
    publish,
    sweep,
    tagged_mp3,
    tracks,
)
from beatos_mcp.server import app as mcp_asgi_app, mcp

# Side-effect import: registers every MCP write tool's apply handler into
# beatos_core.approvals (consumed by beatos_core.agent_permission.submit_write).
# Without this
# the sidecar's apply registry is empty and every write tool fails with
# "no apply handler" — the 2PC-removal regression caught by QA 2026-06-19.
import beatos_http.handlers  # noqa: E402, F401

log = logging.getLogger(__name__)

def _allowed_origins() -> list[str]:
    """CORS allowlist for the no-auth /api surface.

    The dev Vite origins are always allowed. ``"null"`` — the packaged Electron
    file:// origin — is included ONLY when we're not serving the web SPA. In web
    mode (``BEATOS_WEB_DIR`` set) the SPA is same-origin (``http://127.0.0.1:<port>``),
    so a file:// page is never a legitimate caller; allowing ``"null"`` there
    would let any local ``.html`` the user opens read/write this unauthenticated
    API (flip the agent-approval mode, read files via /api/fs). Drop it.
    """
    origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
    if not os.environ.get("BEATOS_WEB_DIR"):
        origins.append("null")
    return origins

@asynccontextmanager
async def lifespan(app: FastAPI):
    await run_migrations(resolve_db_path())
    log.info("sidecar startup: migrations applied")

    # Seed a demo track on a brand-new, empty install (best-effort, never raises).
    await seed_demo_if_needed()

    # Initialize FastMCP session manager (v0.0.23: MCP mounted at /mcp).
    # session_manager.run() uses an anyio task group that must be entered and
    # exited in the same asyncio task.  Running it in a dedicated background
    # task decouples the cancel-scope lifecycle from the lifespan coroutine,
    # which avoids the "exit from different task" error that pytest-asyncio
    # triggers during fixture teardown.  The session_manager instance is a
    # module-level singleton that can only be started once; subsequent lifespan
    # entries (e.g. multiple test fixtures) skip re-entry.
    sm = mcp.session_manager
    mcp_task: asyncio.Task | None = None
    # v0.0.24: verified against mcp 1.27.1 — no public running/is_started API exists.
    # Pre-mcp public-API: keep _has_started guard, pinned in beatos-mcp pyproject.toml to mcp>=1.27,<1.28.
    if not sm._has_started:
        ready = asyncio.Event()

        async def _run_mcp() -> None:
            async with sm.run():
                ready.set()
                await asyncio.get_event_loop().create_future()  # park until cancelled

        mcp_task = asyncio.create_task(_run_mcp())
        await ready.wait()

    try:
        yield
    finally:
        if mcp_task is not None:
            mcp_task.cancel()
            try:
                await mcp_task
            except asyncio.CancelledError:
                pass


def create_app() -> FastAPI:
    app = FastAPI(title="BeatOS HTTP", version=__version__, lifespan=lifespan)

    app.add_middleware(CorrelationIdMiddleware, header_name="X-Request-ID")

    @app.middleware("http")
    async def bind_request_id(request, call_next):
        from asgi_correlation_id.context import correlation_id

        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=correlation_id.get())
        try:
            return await call_next(request)
        finally:
            structlog.contextvars.clear_contextvars()

    # Restrict to the renderer's own origins (dev Vite server + packaged app's
    # file:// origin, which reports as "null"). A wildcard here would let any
    # web page the user visits reach this no-auth localhost API and approve
    # pending write tokens cross-origin — defeating the human-in-the-loop gate.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_origins(),
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(tracks.router)
    app.include_router(bulk.router)
    app.include_router(assets.router)
    app.include_router(lists.router)
    app.include_router(licenses.router)
    app.include_router(sweep.router)
    app.include_router(analysis.router)
    app.include_router(export.router)
    app.include_router(inject.router)
    app.include_router(inject.read_router)
    app.include_router(producers.router)
    app.include_router(pro.router)
    app.include_router(publish.router)
    app.include_router(app_settings.router)
    app.include_router(ai.router)
    app.include_router(ai.track_router)
    app.include_router(batch_tagging.router)
    app.include_router(license_pdf.track_router)
    app.include_router(tagged_mp3.track_router)
    app.include_router(agent_actions.router)
    app.include_router(batch_analysis.router)
    # /api/fs (whole-disk browse + open) serves the WEB file browser only; the
    # Electron renderer uses native dialogs via the preload bridge. The Electron
    # main sets BEATOS_DISABLE_FS_API=1 so the file:// attack surface (CORS allows
    # the "null" origin there) is absent in the desktop app.
    if not os.environ.get("BEATOS_DISABLE_FS_API"):
        app.include_router(fs.router)

    # Guard /mcp with a per-process local token (advertised via the handshake,
    # sent by the launcher). No-op when BEATOS_MCP_DISABLE_AUTH=1. /api/* and the
    # web SPA are unaffected — they never use /mcp.
    app.mount("/mcp", guard_mcp_app(mcp_asgi_app, get_mcp_token()))

    # Serve the built web SPA (browser frontend) when a build directory is
    # configured. Mounted LAST so /api/* and /mcp routes always win. HashRouter
    # keeps client routes in the URL fragment, so html=True (serve index.html at
    # "/") is sufficient — no server-side SPA fallback needed.
    web_dir = os.environ.get("BEATOS_WEB_DIR")
    if web_dir and pathlib.Path(web_dir).is_dir():
        app.mount("/", StaticFiles(directory=web_dir, html=True), name="web")

    return app


INJECT_PORT = int(os.environ.get("BEATOS_INJECT_PORT", "48923"))


def _try_bind_fixed(port: int, host: str = "127.0.0.1") -> socket.socket | None:
    """Bind the fixed extension-facing port. Returns the socket, or None if the
    port is already in use (graceful degrade: the extension features are simply
    unavailable this session; the main API is unaffected)."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.bind((host, port))
        return sock
    except OSError:
        sock.close()
        return None


def create_inject_app() -> FastAPI:
    """Minimal fixed-port app for the browser extension.

    Read-only: serves ONLY the inject read_router (ping / pending / form-map).
    The write endpoint (/stage) is intentionally absent — the renderer stages
    via the main ephemeral API port. No CORS (the extension uses
    host_permissions, which bypasses page CORS; the absence of CORS headers
    makes browsers fail the preflight for random web pages doing cross-origin
    JSON POSTs). No MCP, no lifespan — shares the same process and the same
    inject._STAGED singleton as the main app.
    """
    app = FastAPI(title="BeatOS Inject", version="0.0.4")
    app.include_router(inject.read_router)
    return app
