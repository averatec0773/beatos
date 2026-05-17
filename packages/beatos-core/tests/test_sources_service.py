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
async def test_create_source_accepts_nonexistent_path(tmp_path):
    # An offline Source (e.g., external drive unplugged at registration time)
    # is a legal state per charter §6.
    missing = tmp_path / "DoesNotExist"
    src = await create_source(SourceCreate(root_path=str(missing)))
    assert src.root_path == str(missing.resolve())


@pytest.mark.asyncio
async def test_create_source_rejects_non_directory(tmp_path):
    f = tmp_path / "file.txt"
    f.write_text("x")

    with pytest.raises(ValueError, match="not a directory"):
        await create_source(SourceCreate(root_path=str(f)))


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


@pytest.mark.asyncio
async def test_create_source_rejects_trailing_slash_duplicate(tmp_path):
    """Creating with a trailing slash on an already-registered path must raise."""
    folder = tmp_path / "Beats"
    folder.mkdir()

    await create_source(SourceCreate(root_path=str(folder)))

    with pytest.raises(ValueError, match="already registered"):
        await create_source(SourceCreate(root_path=str(folder) + "/"))


@pytest.mark.asyncio
async def test_create_source_rejects_symlink_duplicate(tmp_path):
    """A symlink pointing at an already-registered directory must raise."""
    folder = tmp_path / "Beats"
    folder.mkdir()
    link = tmp_path / "BeatsLink"
    link.symlink_to(folder)

    await create_source(SourceCreate(root_path=str(folder)))

    with pytest.raises(ValueError, match="already registered"):
        await create_source(SourceCreate(root_path=str(link)))


import os


@pytest.mark.asyncio
async def test_get_source_status_online_when_exists(tmp_path):
    from beatos_core.sources.service import get_source_status
    from beatos_core.sources.models import SourceStatus

    folder = tmp_path / "beats"
    folder.mkdir()
    s = await create_source(SourceCreate(root_path=str(folder)))
    status = await get_source_status(s.id)
    assert status is not None
    assert isinstance(status, SourceStatus)
    assert status.status == "online"


@pytest.mark.asyncio
async def test_get_source_status_offline_when_path_missing(tmp_path):
    from beatos_core.sources.service import get_source_status

    folder = tmp_path / "beats"
    folder.mkdir()
    s = await create_source(SourceCreate(root_path=str(folder)))
    os.rmdir(folder)
    status = await get_source_status(s.id)
    assert status is not None
    assert status.status == "offline"


@pytest.mark.asyncio
async def test_get_source_status_returns_none_for_missing_id():
    from beatos_core.sources.service import get_source_status

    assert await get_source_status(99999) is None


@pytest.mark.asyncio
async def test_update_source_position(tmp_path):
    folder = tmp_path / "Beats"
    folder.mkdir()
    src = await create_source(SourceCreate(root_path=str(folder)))
    assert src.position == 0

    updated = await update_source(src.id, SourceUpdate(position=5))

    assert updated is not None
    assert updated.position == 5

    fetched = await get_source(src.id)
    assert fetched is not None
    assert fetched.position == 5
