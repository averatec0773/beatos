"""Tests for beatos_core.library.service."""
import pathlib

import pytest

from beatos_core.library.service import (
    get_active_library,
    init_library_root,
    list_libraries,
)
from beatos_core import state


@pytest.fixture(autouse=True)
async def _fresh(tmp_path, monkeypatch):
    """Reset state and isolate the registry per test."""
    monkeypatch.setenv("BEATOS_REGISTRY_PATH", str(tmp_path / "known_libraries.json"))
    await state.set_active(None)
    yield
    await state.set_active(None)


@pytest.mark.asyncio
async def test_init_creates_new_library_and_registers_it(tmp_path):
    root = tmp_path / "MyLib"
    root.mkdir()

    lib = await init_library_root(root)

    assert lib.root_path == str(root.resolve())
    assert lib.is_active is True
    assert (root / ".beatos" / "db.sqlite").exists()

    libs = await list_libraries()
    assert any(l.root_path == str(root.resolve()) for l in libs)


@pytest.mark.asyncio
async def test_init_opens_existing_library(tmp_path):
    root = tmp_path / "MyLib"
    root.mkdir()
    await init_library_root(root)
    await state.set_active(None)

    lib = await init_library_root(root)

    assert lib.root_path == str(root.resolve())
    assert lib.is_active is True


@pytest.mark.asyncio
async def test_list_libraries_returns_registry_entries(tmp_path):
    root_a = tmp_path / "LibA"
    root_b = tmp_path / "LibB"
    root_a.mkdir()
    root_b.mkdir()

    await init_library_root(root_a)
    await init_library_root(root_b)

    libs = await list_libraries()

    paths = sorted(l.root_path for l in libs)
    assert paths == sorted([str(root_a.resolve()), str(root_b.resolve())])
    actives = [l for l in libs if l.is_active]
    assert len(actives) == 1
    assert actives[0].root_path == str(root_b.resolve())


@pytest.mark.asyncio
async def test_init_switches_active_to_target(tmp_path):
    root_a = tmp_path / "LibA"
    root_b = tmp_path / "LibB"
    root_a.mkdir()
    root_b.mkdir()
    await init_library_root(root_a)

    await init_library_root(root_b)
    active = await get_active_library()

    assert active is not None
    assert active.root_path == str(root_b.resolve())


@pytest.mark.asyncio
async def test_get_active_returns_none_when_no_library(tmp_path):
    active = await get_active_library()
    assert active is None
