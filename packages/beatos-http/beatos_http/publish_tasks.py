"""Live publish-task tracking, shared by the HTTP route and the MCP handler.

A publish is a fire-and-forget asyncio task driving a real browser. asyncio holds
only weak refs to bare tasks, so we keep a STRONG ref (they'd be GC'd mid-run)
AND index them by job_id — so deleting a still-running job can CANCEL the task,
which unwinds `async with browser_context(...)` and closes the browser (audit
P19). Without this, DELETE only dropped the record while the browser kept driving.
"""
from __future__ import annotations

import asyncio

_TASKS: dict[str, asyncio.Task] = {}


def track(job_id: str, task: asyncio.Task) -> None:
    """Register a live publish task; it auto-unregisters on completion."""
    _TASKS[job_id] = task
    task.add_done_callback(lambda _t: _TASKS.pop(job_id, None))


def cancel(job_id: str) -> bool:
    """Cancel a live publish task if one is running for this job. Returns True if
    a running task was cancelled. Cancellation propagates CancelledError into the
    engine's `async with browser_context`, whose finally-block closes the browser."""
    task = _TASKS.get(job_id)
    if task is not None and not task.done():
        task.cancel()
        return True
    return False
