"""FastAPI application factory.

Lifespan wiring (v0.0.4):
- Run DB migrations on startup.
- Start a WatcherRegistry observer for every currently-online Source.
- Start a SourceStatusMonitor that flips watchers on/off as Sources go online/offline.
- On shutdown: stop the monitor, then stop_all() observers.
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import structlog
from asgi_correlation_id import CorrelationIdMiddleware
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from beatos_core.db import resolve_db_path, run_migrations
from beatos_core.sources.monitor import SourceStatusMonitor
from beatos_core.sources.service import get_source, list_sources
from beatos_core.watcher.daemon import WatcherRegistry
from beatos_http.routes import analysis, assets, lists, producers, sources, sweep, tokens, tracks

log = logging.getLogger(__name__)

_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "null",
]

# Module-level runtime state (per-process singletons).
_watcher_registry: Optional[WatcherRegistry] = None
_monitor: Optional[SourceStatusMonitor] = None


def get_watcher_registry() -> WatcherRegistry:
    """Return the lifespan-managed WatcherRegistry.

    Raises RuntimeError if called outside the FastAPI lifespan (i.e. before
    startup or after shutdown).
    """
    if _watcher_registry is None:
        raise RuntimeError("Watcher registry not initialized (lifespan not active)")
    return _watcher_registry


def get_watcher_registry_or_none() -> Optional[WatcherRegistry]:
    """Soft variant: returns None outside an active lifespan."""
    return _watcher_registry


def _on_new_file_in_source(path: Path, source_id: int) -> None:
    """Called by watchdog on file create events. Currently diagnostic-only."""
    log.debug("watcher: new file in source %d: %s", source_id, path)


def _handle_status_change_sync(source_id: int, new_status: str) -> None:
    """Sync bridge: schedule an async handler on the running event loop.

    SourceStatusMonitor calls this from its own asyncio task; we forward to
    an async coroutine because we need to look up the Source's root_path
    (an async DB call) when flipping a watcher online.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    loop.create_task(_handle_status_change_async(source_id, new_status))


async def _handle_status_change_async(source_id: int, new_status: str) -> None:
    registry = _watcher_registry
    if registry is None:
        return
    if new_status == "offline":
        registry.stop_for_source(source_id)
        return
    if new_status == "online":
        src = await get_source(source_id)
        if src is None:
            return
        root = Path(src.root_path)
        if root.is_dir():
            registry.start_for_source(source_id, root)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _watcher_registry, _monitor

    await run_migrations(resolve_db_path())

    _watcher_registry = WatcherRegistry(on_new_file=_on_new_file_in_source)

    # Start watchers for currently-online Sources.
    for s in await list_sources():
        root = Path(s.root_path)
        if root.is_dir():
            _watcher_registry.start_for_source(s.id, root)

    _monitor = SourceStatusMonitor(
        interval_s=5.0,
        on_status_change=_handle_status_change_sync,
    )
    await _monitor.start()

    try:
        yield
    finally:
        if _monitor is not None:
            await _monitor.stop()
            _monitor = None
        if _watcher_registry is not None:
            _watcher_registry.stop_all()
            _watcher_registry = None


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
    app.include_router(sources.router)
    app.include_router(analysis.router)
    app.include_router(producers.router)
    app.include_router(tokens.router)

    return app
