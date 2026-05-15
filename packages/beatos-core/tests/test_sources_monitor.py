import asyncio
import os
import pytest
from pathlib import Path

from beatos_core.db import run_migrations
from beatos_core.sources.models import SourceCreate
from beatos_core.sources.service import create_source
from beatos_core.sources.monitor import SourceStatusMonitor


@pytest.fixture(autouse=True)
async def _fresh_db(tmp_path, monkeypatch):
    db_path = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(db_path))
    await run_migrations(db_path)


@pytest.mark.asyncio
async def test_monitor_detects_offline_transition(tmp_path):
    folder = tmp_path / "beats"
    folder.mkdir()
    src = await create_source(SourceCreate(root_path=str(folder)))

    events: list[tuple[int, str]] = []
    monitor = SourceStatusMonitor(
        interval_s=0.1,
        on_status_change=lambda sid, status: events.append((sid, status)),
    )
    await monitor.start()
    try:
        await asyncio.sleep(0.15)  # first poll establishes baseline
        os.rmdir(folder)
        await asyncio.sleep(0.2)  # next poll should detect offline
        assert (src.id, "offline") in events
    finally:
        await monitor.stop()


@pytest.mark.asyncio
async def test_monitor_emits_online_after_recovery(tmp_path):
    folder = tmp_path / "beats"
    folder.mkdir()
    src = await create_source(SourceCreate(root_path=str(folder)))

    events: list[tuple[int, str]] = []
    monitor = SourceStatusMonitor(
        interval_s=0.05,
        on_status_change=lambda sid, status: events.append((sid, status)),
    )
    await monitor.start()
    try:
        await asyncio.sleep(0.1)  # baseline = online
        os.rmdir(folder)
        await asyncio.sleep(0.15)  # offline event
        folder.mkdir()
        await asyncio.sleep(0.15)  # online event
        assert any(s == "offline" for _, s in events)
        assert any(s == "online" for _, s in events)
    finally:
        await monitor.stop()


@pytest.mark.asyncio
async def test_monitor_stop_is_idempotent():
    monitor = SourceStatusMonitor(
        interval_s=0.1,
        on_status_change=lambda *a: None,
    )
    await monitor.start()
    await monitor.stop()
    await monitor.stop()  # must not raise


@pytest.mark.asyncio
async def test_monitor_start_is_idempotent():
    monitor = SourceStatusMonitor(
        interval_s=0.1,
        on_status_change=lambda *a: None,
    )
    await monitor.start()
    await monitor.start()  # must not raise; should be no-op
    await monitor.stop()


@pytest.mark.asyncio
async def test_first_poll_does_not_emit(tmp_path):
    """When a Source is added before monitor starts and is already online,
    the first poll establishes baseline and does NOT emit an 'online' event."""
    folder = tmp_path / "beats"
    folder.mkdir()
    await create_source(SourceCreate(root_path=str(folder)))
    events: list = []
    monitor = SourceStatusMonitor(
        interval_s=0.05,
        on_status_change=lambda sid, st: events.append((sid, st)),
    )
    await monitor.start()
    await asyncio.sleep(0.15)
    await monitor.stop()
    assert events == []  # no flips yet
