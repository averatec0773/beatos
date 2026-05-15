"""Tests for list lifecycle (create / rename / delete / list)."""
import pytest

from beatos_core import state
from beatos_core.library.service import init_library_root
from beatos_core.lists.service import (
    create_list,
    delete_list,
    list_lists,
    update_list,
)


@pytest.fixture(autouse=True)
async def _fresh(tmp_path, monkeypatch):
    monkeypatch.setenv("BEATOS_REGISTRY_PATH", str(tmp_path / "known_libraries.json"))
    await state.set_active(None)
    yield
    await state.set_active(None)


async def _setup(tmp_path):
    root = tmp_path / "Lib"
    root.mkdir()
    await init_library_root(root)


@pytest.mark.asyncio
async def test_list_lists_includes_system_after_init(tmp_path):
    await _setup(tmp_path)
    lists = await list_lists()
    names = sorted((l.name, l.kind) for l in lists)
    assert ("All Beats", "system") in names


@pytest.mark.asyncio
async def test_create_user_list(tmp_path):
    await _setup(tmp_path)
    new = await create_list(name="Trap", kind="user")
    assert new.id > 0
    assert new.name == "Trap"
    assert new.kind == "user"


@pytest.mark.asyncio
async def test_rename_user_list(tmp_path):
    await _setup(tmp_path)
    new = await create_list(name="Trap", kind="user")
    updated = await update_list(new.id, {"name": "Trap 2026"})
    assert updated.name == "Trap 2026"


@pytest.mark.asyncio
async def test_delete_user_list(tmp_path):
    await _setup(tmp_path)
    new = await create_list(name="Trap", kind="user")
    await delete_list(new.id)
    lists = await list_lists()
    assert all(l.id != new.id for l in lists)


@pytest.mark.asyncio
async def test_delete_system_list_blocked(tmp_path):
    """System list 'All Beats' must not be deletable."""
    await _setup(tmp_path)
    system = next(l for l in await list_lists() if l.kind == "system")
    with pytest.raises(ValueError):
        await delete_list(system.id)
