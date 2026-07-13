"""Unit tests for the live publish-task registry (audit P19 — cancel on delete).

Pure module, no Pro engine needed."""
import asyncio

import pytest

from beatos_http import publish_tasks


@pytest.mark.asyncio
async def test_cancel_running_task_returns_true():
    started = asyncio.Event()

    async def _run():
        started.set()
        await asyncio.sleep(60)  # long-lived, like a held publish

    task = asyncio.create_task(_run())
    publish_tasks.track("job-1", task)
    await started.wait()

    assert publish_tasks.cancel("job-1") is True
    with pytest.raises(asyncio.CancelledError):
        await task
    assert task.cancelled()


@pytest.mark.asyncio
async def test_task_auto_unregisters_on_completion():
    async def _run():
        return "done"

    task = asyncio.create_task(_run())
    publish_tasks.track("job-2", task)
    await task
    # Completed task auto-removed → cancel is a no-op returning False.
    assert publish_tasks.cancel("job-2") is False


@pytest.mark.asyncio
async def test_cancel_unknown_job_is_false():
    assert publish_tasks.cancel("nope") is False


@pytest.mark.asyncio
async def test_cancel_already_finished_task_is_false():
    async def _run():
        return 1

    task = asyncio.create_task(_run())
    publish_tasks.track("job-3", task)
    await task
    assert publish_tasks.cancel("job-3") is False
