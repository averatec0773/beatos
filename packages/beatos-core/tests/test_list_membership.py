"""Tests for adding / removing tracks in lists."""
import pytest

from beatos_core import state
from beatos_core.library.service import init_library_root
from beatos_core.lists.service import create_list
from beatos_core.lists.membership import add_track_to_list, remove_track_from_list, tracks_in_list
from beatos_core.tracks.service import create_track


@pytest.fixture(autouse=True)
async def _fresh(tmp_path, monkeypatch):
    monkeypatch.setenv("BEATOS_REGISTRY_PATH", str(tmp_path / "known_libraries.json"))
    await state.set_active(None)
    yield
    await state.set_active(None)


@pytest.mark.asyncio
async def test_add_track_appears_in_list(tmp_path):
    root = tmp_path / "Lib"
    root.mkdir()
    await init_library_root(root)
    track = await create_track("T1")
    lst = await create_list(name="Trap", kind="user")

    await add_track_to_list(track.id, lst.id)
    items = await tracks_in_list(lst.id)

    assert len(items) == 1
    assert items[0].id == track.id


@pytest.mark.asyncio
async def test_remove_track_drops_membership(tmp_path):
    root = tmp_path / "Lib"
    root.mkdir()
    await init_library_root(root)
    track = await create_track("T1")
    lst = await create_list(name="Trap", kind="user")
    await add_track_to_list(track.id, lst.id)

    await remove_track_from_list(track.id, lst.id)

    items = await tracks_in_list(lst.id)
    assert items == []


@pytest.mark.asyncio
async def test_add_track_twice_is_idempotent(tmp_path):
    root = tmp_path / "Lib"
    root.mkdir()
    await init_library_root(root)
    track = await create_track("T1")
    lst = await create_list(name="Trap", kind="user")

    await add_track_to_list(track.id, lst.id)
    await add_track_to_list(track.id, lst.id)  # second call must not error

    items = await tracks_in_list(lst.id)
    assert len(items) == 1
