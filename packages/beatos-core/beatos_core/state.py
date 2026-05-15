"""Process-level active-library state.

The sidecar is single-tenant. Routes use get_active / require_active to read,
set_active to mutate (under module-level asyncio.Lock).
"""
from __future__ import annotations

import asyncio
import pathlib
from dataclasses import dataclass
from typing import Optional

from beatos_core.models import Library


@dataclass
class ActiveLibrary:
    library: Library
    db_path: pathlib.Path


_active: Optional[ActiveLibrary] = None
_lock = asyncio.Lock()

# Active watchdog Observer instances per library, keyed by library.id.
# Populated by beatos_core.watcher.daemon when sidecar boots and library activates.
_active_watchers: dict[int, object] = {}


def get_watchers() -> dict[int, object]:
    return _active_watchers


def set_watcher(library_id: int, observer: object) -> None:
    _active_watchers[library_id] = observer


def remove_watcher(library_id: int) -> object | None:
    return _active_watchers.pop(library_id, None)


def get_active() -> Optional[ActiveLibrary]:
    return _active


async def set_active(active: Optional[ActiveLibrary]) -> None:
    global _active
    async with _lock:
        _active = active


def require_active() -> ActiveLibrary:
    if _active is None:
        raise RuntimeError("No active library — call /api/libraries/init first.")
    return _active
