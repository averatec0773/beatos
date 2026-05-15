from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Callable, Optional

from .service import list_sources

log = logging.getLogger(__name__)

OnStatusChange = Callable[[int, str], None]


class SourceStatusMonitor:
    """Polls each Source root_path every `interval_s` seconds.

    Emits `on_status_change(source_id, "online" | "offline")` when state flips.
    First observation per Source establishes baseline (no event).

    Wiring contract (per spec §6):
    - HTTP layer's lifespan constructs one monitor + passes a callback that
      starts/stops watchers in WatcherRegistry.
    - Renderer is notified separately via polling GET /api/sources.
    """

    def __init__(
        self,
        interval_s: float = 5.0,
        on_status_change: Optional[OnStatusChange] = None,
    ) -> None:
        self._interval_s = interval_s
        self._on_status_change = on_status_change or (lambda sid, st: None)
        self._task: Optional[asyncio.Task] = None
        self._stop_evt = asyncio.Event()
        self._last_status: dict[int, str] = {}

    async def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        self._stop_evt = asyncio.Event()
        self._task = asyncio.create_task(self._loop(), name="source-status-monitor")
        log.info("SourceStatusMonitor started (interval=%ss)", self._interval_s)

    async def stop(self) -> None:
        if self._task is None:
            return
        self._stop_evt.set()
        try:
            await asyncio.wait_for(self._task, timeout=self._interval_s + 1.0)
        except asyncio.TimeoutError:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
        self._task = None
        log.info("SourceStatusMonitor stopped")

    async def _loop(self) -> None:
        while not self._stop_evt.is_set():
            try:
                await self._poll_once()
            except Exception:
                log.exception("monitor poll error")
            try:
                await asyncio.wait_for(self._stop_evt.wait(), timeout=self._interval_s)
            except asyncio.TimeoutError:
                pass

    async def _poll_once(self) -> None:
        sources = await list_sources()
        for s in sources:
            new_status = "online" if Path(s.root_path).is_dir() else "offline"
            prev = self._last_status.get(s.id)
            if prev is not None and prev != new_status:
                self._on_status_change(s.id, new_status)
            self._last_status[s.id] = new_status
