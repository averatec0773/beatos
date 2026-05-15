import asyncio
import pytest
from pathlib import Path

from beatos_core.watcher.daemon import WatcherRegistry


@pytest.mark.asyncio
async def test_registry_starts_and_stops_observers(tmp_path):
    folder_a = tmp_path / "a"; folder_a.mkdir()
    folder_b = tmp_path / "b"; folder_b.mkdir()
    registry = WatcherRegistry(on_new_file=lambda p, sid: None)
    registry.start_for_source(source_id=1, root=folder_a)
    registry.start_for_source(source_id=2, root=folder_b)
    assert registry.active_source_ids() == {1, 2}
    registry.stop_for_source(source_id=1)
    assert registry.active_source_ids() == {2}
    registry.stop_all()
    assert registry.active_source_ids() == set()


@pytest.mark.asyncio
async def test_registry_starting_same_source_twice_is_no_op(tmp_path):
    folder = tmp_path / "a"; folder.mkdir()
    registry = WatcherRegistry(on_new_file=lambda p, sid: None)
    registry.start_for_source(source_id=1, root=folder)
    registry.start_for_source(source_id=1, root=folder)
    assert registry.active_source_ids() == {1}
    registry.stop_all()


def test_registry_stopping_unknown_source_is_no_op(tmp_path):
    registry = WatcherRegistry(on_new_file=lambda p, sid: None)
    registry.stop_for_source(source_id=999)  # must not raise
    assert registry.active_source_ids() == set()
