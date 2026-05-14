"""Tests for beatos_core.tracks.service."""
import pathlib

import pytest

from beatos_core.library.service import init_library_root
from beatos_core.tracks.service import (
    create_track,
    delete_track,
    get_track,
    list_tracks,
    update_track,
)
from beatos_core import state


@pytest.fixture(autouse=True)
async def _fresh(tmp_path, monkeypatch):
    monkeypatch.setenv("BEATOS_REGISTRY_PATH", str(tmp_path / "known_libraries.json"))
    await state.set_active(None)
    yield
    await state.set_active(None)


async def _setup_library(tmp_path):
    root = tmp_path / "MyLib"
    root.mkdir()
    await init_library_root(root)


@pytest.mark.asyncio
async def test_create_requires_active_library(tmp_path):
    await state.set_active(None)
    with pytest.raises(RuntimeError):
        await create_track("Untitled")


@pytest.mark.asyncio
async def test_create_returns_track_with_id(tmp_path):
    await _setup_library(tmp_path)
    t = await create_track("Untitled")
    assert t.id > 0
    assert t.title == "Untitled"
    assert t.license_type == "lease_basic"


@pytest.mark.asyncio
async def test_list_returns_only_active_library_tracks(tmp_path):
    await _setup_library(tmp_path)
    await create_track("A")
    await create_track("B")

    rows = await list_tracks()

    titles = sorted(r.title for r in rows)
    assert titles == ["A", "B"]


@pytest.mark.asyncio
async def test_update_partial_preserves_other_fields(tmp_path):
    await _setup_library(tmp_path)
    t = await create_track("Untitled")

    updated = await update_track(t.id, {"bpm": 140})

    assert updated.bpm == 140
    assert updated.title == "Untitled"


@pytest.mark.asyncio
async def test_update_rejects_description_draft(tmp_path):
    """description_draft is sacred — only AI tools may set it."""
    await _setup_library(tmp_path)
    t = await create_track("Untitled")

    with pytest.raises(ValueError):
        await update_track(t.id, {"description_draft": "AI text"})


@pytest.mark.asyncio
async def test_delete_removes_track(tmp_path):
    await _setup_library(tmp_path)
    t = await create_track("Untitled")

    await delete_track(t.id)

    rows = await list_tracks()
    assert rows == []
    assert await get_track(t.id) is None
