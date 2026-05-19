"""FastAPI application factory.

Lifespan wiring (v0.0.4):
- Run DB migrations on startup.
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

import aiosqlite
import structlog
from asgi_correlation_id import CorrelationIdMiddleware
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from beatos_core.db import resolve_db_path, run_migrations
from beatos_core.two_phase import cleanup_terminal_tokens
from beatos_http.routes import analysis, assets, lists, producers, sweep, tokens, tracks

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

    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r".*",
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(tracks.router)
    app.include_router(assets.router)
    app.include_router(lists.router)
    app.include_router(sweep.router)
    app.include_router(analysis.router)
    app.include_router(producers.router)
    app.include_router(tokens.router)

    return app
