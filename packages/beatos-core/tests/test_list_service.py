"""Tests for list lifecycle (create / rename / delete / list)."""
import pytest

from beatos_core.db import run_migrations
from beatos_core.lists.service import (
    create_list,
    delete_list,
    get_list,
    list_lists,
    update_list,
)


@pytest.fixture(autouse=True)
async def _fresh_db(tmp_path, monkeypatch):
    """Each test gets its own isolated global DB with migrations applied."""
    db_path = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(db_path))
    await run_migrations(db_path)
    yield


@pytest.mark.asyncio
async def test_list_lists_includes_system_after_init():
    lists = await list_lists()
    names = sorted((l.name, l.kind) for l in lists)
    assert ("All Beats", "system") in names


@pytest.mark.asyncio
async def test_create_user_list():
    new = await create_list(name="Trap", kind="user")
    assert new.id > 0
    assert new.name == "Trap"
    assert new.kind == "user"


@pytest.mark.asyncio
async def test_create_rejects_system_kind():
    with pytest.raises(ValueError):
        await create_list(name="X", kind="system")


@pytest.mark.asyncio
async def test_rename_user_list():
    new = await create_list(name="Trap", kind="user")
    updated = await update_list(new.id, {"name": "Trap 2026"})
    assert updated.name == "Trap 2026"


@pytest.mark.asyncio
async def test_update_rejects_unknown_field():
    new = await create_list(name="Trap", kind="user")
    with pytest.raises(ValueError):
        await update_list(new.id, {"nonexistent": "x"})


@pytest.mark.asyncio
async def test_delete_user_list():
    new = await create_list(name="Trap", kind="user")
    await delete_list(new.id)
    lists = await list_lists()
    assert all(l.id != new.id for l in lists)


@pytest.mark.asyncio
async def test_delete_system_list_blocked():
    """System list 'All Beats' must not be deletable."""
    system = next(l for l in await list_lists() if l.kind == "system")
    with pytest.raises(ValueError):
        await delete_list(system.id)


@pytest.mark.asyncio
async def test_get_list_returns_none_for_missing_id():
    assert await get_list(99999) is None
