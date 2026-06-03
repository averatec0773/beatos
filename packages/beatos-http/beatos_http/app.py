"""FastAPI application factory.

Lifespan wiring (v0.0.4):
- Run DB migrations on startup.
v0.0.23: Mount FastMCP app and manage its lifespan.
"""
from __future__ import annotations

import asyncio
import logging
import os
import socket
from contextlib import asynccontextmanager
from typing import Optional

import aiosqlite
import structlog
from asgi_correlation_id import CorrelationIdMiddleware
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from beatos_core.db import resolve_db_path, run_migrations
from beatos_core.two_phase import cleanup_terminal_tokens
from beatos_http.routes import (
    analysis,
    app_settings,
    assets,
    batch_analysis,
    bulk,
    export,
    inject,
    licenses,
    lists,
    pro,
    producers,
    publish,
    sweep,
    tokens,
    tracks,
)
from beatos_mcp.server import app as mcp_asgi_app, mcp

log = logging.getLogger(__name__)

_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "null",
]

# Module-level runtime state (per-process singletons).
_cleanup_task: Optional[asyncio.Task] = None


async def _periodic_token_cleanup(db_path_str: str) -> None:
    """Hourly cleanup of terminal tokens older than 7 days. Sleeps first to
    avoid racing with the synchronous startup cleanup. Inner try/except so a
    single failure doesn't kill the loop."""
    while True:
        await asyncio.sleep(3600)
        try:
            async with aiosqlite.connect(db_path_str) as conn:
                deleted = await cleanup_terminal_tokens(conn)
                if deleted:
                    log.info("token cleanup removed %d rows", deleted)
        except Exception:
            log.exception("token cleanup failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _cleanup_task

    await run_migrations(resolve_db_path())
    log.info("sidecar startup: migrations applied")

    # Cleanup once on startup so a fresh sidecar sees a tidy table.
    db_path_str = str(resolve_db_path())
    async with aiosqlite.connect(db_path_str) as conn:
        await cleanup_terminal_tokens(conn)
    # Then fire-and-forget the hourly loop.
    _cleanup_task = asyncio.create_task(_periodic_token_cleanup(db_path_str))

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
        if _cleanup_task is not None:
            _cleanup_task.cancel()
            try:
                await _cleanup_task
            except asyncio.CancelledError:
                pass
            _cleanup_task = None
        if mcp_task is not None:
            mcp_task.cancel()
            try:
                await mcp_task
            except asyncio.CancelledError:
                pass


def create_app() -> FastAPI:
    app = FastAPI(title="BeatOS HTTP", version="0.0.4", lifespan=lifespan)

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
        allow_origins=_ALLOWED_ORIGINS,
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
    app.include_router(tokens.router)
    app.include_router(batch_analysis.router)

    app.mount("/mcp", mcp_asgi_app)

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
