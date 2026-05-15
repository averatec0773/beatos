"""Tests for beatos_core.sources.service CRUD."""
import pathlib

import pytest

from beatos_core.db import run_migrations
from beatos_core.sources.service import (
    create_source,
    delete_source,
    find_source_for_path,
    get_source,
    list_sources,
    update_source,
)
from beatos_core.sources.models import SourceCreate, SourceUpdate


@pytest.fixture(autouse=True)
async def _fresh_db(tmp_path, monkeypatch):
    """Each test gets its own isolated global DB with migrations applied."""
    db_path = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(db_path))
    await run_migrations(db_path)
    yield


@pytest.mark.asyncio
async def test_create_source_returns_row(tmp_path):
    folder = tmp_path / "Beats"
    folder.mkdir()

    src = await create_source(SourceCreate(root_path=str(folder)))

    assert src.id > 0
    assert src.name == "Beats"
    assert src.root_path == str(folder)
    assert src.position == 0
    assert src.created_at is not None


@pytest.mark.asyncio
async def test_create_source_rejects_duplicate_path(tmp_path):
    folder = tmp_path / "Beats"
    folder.mkdir()

    await create_source(SourceCreate(root_path=str(folder)))

    with pytest.raises(ValueError, match="already registered"):
        await create_source(SourceCreate(root_path=str(folder)))


@pytest.mark.asyncio
async def test_create_source_rejects_nonexistent_path(tmp_path):
    missing = tmp_path / "DoesNotExist"

    with pytest.raises(ValueError, match="does not exist"):
        await create_source(SourceCreate(root_path=str(missing)))


@pytest.mark.asyncio
async def test_list_sources_ordered_by_position(tmp_path):
    folder_a = tmp_path / "A"
    folder_b = tmp_path / "B"
    folder_a.mkdir()
    folder_b.mkdir()

    # Both at default position=0 — tiebreak by id ASC
    src_a = await create_source(SourceCreate(root_path=str(folder_a)))
    src_b = await create_source(SourceCreate(root_path=str(folder_b)))

    sources = await list_sources()

    assert len(sources) == 2
    assert sources[0].id == src_a.id
    assert sources[1].id == src_b.id


@pytest.mark.asyncio
async def test_update_source_rename(tmp_path):
    folder = tmp_path / "Beats"
    folder.mkdir()
    src = await create_source(SourceCreate(root_path=str(folder)))

    updated = await update_source(src.id, SourceUpdate(name="My Beats"))

    assert updated is not None
    assert updated.id == src.id
    assert updated.name == "My Beats"
    assert updated.root_path == src.root_path


@pytest.mark.asyncio
async def test_delete_source(tmp_path):
    folder = tmp_path / "Beats"
    folder.mkdir()
    src = await create_source(SourceCreate(root_path=str(folder)))

    await delete_source(src.id)

    assert await get_source(src.id) is None


@pytest.mark.asyncio
async def test_find_source_for_path_returns_matching_source(tmp_path):
    root = tmp_path / "Beats"
    root.mkdir()
    nested = root / "HipHop" / "track.wav"
    nested.parent.mkdir(parents=True)
    nested.touch()

    src = await create_source(SourceCreate(root_path=str(root)))

    found = await find_source_for_path(str(nested))

    assert found is not None
    assert found.id == src.id


@pytest.mark.asyncio
async def test_find_source_for_path_no_prefix_false_match(tmp_path):
    """'/foo' must not match '/foobar'."""
    root = tmp_path / "Beats"
    sibling = tmp_path / "BeatsExtra"
    root.mkdir()
    sibling.mkdir()

    await create_source(SourceCreate(root_path=str(root)))

    found = await find_source_for_path(str(sibling / "track.wav"))

    assert found is None
