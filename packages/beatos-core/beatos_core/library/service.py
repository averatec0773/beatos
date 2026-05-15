"""Library lifecycle service.

A library is identified globally by its absolute root_path. Each library has
its own sqlite db at <root>/.beatos/db.sqlite. A JSON registry at
<user-config-dir>/beatos/known_libraries.json tracks all libraries the user
has ever opened.

Switching the active library = calling init_library_root with a different path.
"""
from __future__ import annotations

import asyncio
import datetime as _dt
import json
import os
import pathlib
import sys
from typing import Optional

import aiosqlite

from beatos_core import state
from beatos_core.db import run_migrations
from beatos_core.models import Library


def _library_db_path(root: pathlib.Path) -> pathlib.Path:
    return root / ".beatos" / "db.sqlite"


def _registry_path() -> pathlib.Path:
    override = os.environ.get("BEATOS_REGISTRY_PATH")
    if override:
        return pathlib.Path(override)

    if sys.platform == "darwin":
        base = pathlib.Path.home() / "Library" / "Application Support" / "BeatOS"
    elif sys.platform.startswith("win"):
        base = pathlib.Path(os.environ.get("APPDATA", pathlib.Path.home())) / "BeatOS"
    else:
        base = pathlib.Path.home() / ".config" / "beatos"

    return base / "known_libraries.json"


def _read_registry() -> list[dict]:
    p = _registry_path()
    if not p.exists():
        return []
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return []


def _write_registry(entries: list[dict]) -> None:
    p = _registry_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(entries, indent=2), encoding="utf-8")
    tmp.replace(p)


def _register(name: str, root_path: str, created_at: str) -> None:
    entries = _read_registry()
    if any(e.get("root_path") == root_path for e in entries):
        return
    entries.append({"name": name, "root_path": root_path, "created_at": created_at})
    _write_registry(entries)


def _row_to_library(row: tuple, is_active_override: Optional[bool] = None) -> Library:
    is_active = is_active_override
    if is_active is None:
        is_active = bool(row[4])
    return Library(
        id=row[0],
        name=row[1],
        root_path=row[2],
        created_at=_dt.datetime.fromisoformat(row[3]),
        is_active=is_active,
    )


async def init_library_root(root: pathlib.Path | str) -> Library:
    root = pathlib.Path(root).resolve()
    db_path = _library_db_path(root)
    is_new = not db_path.exists()
    await run_migrations(db_path)
    now = _dt.datetime.now(_dt.timezone.utc).isoformat()

    async with aiosqlite.connect(db_path) as conn:
        if is_new:
            await conn.execute(
                "INSERT INTO library (name, root_path, created_at, is_active) "
                "VALUES (?, ?, ?, 1)",
                (root.name, str(root), now),
            )
            await conn.commit()
        else:
            await conn.execute(
                "UPDATE library SET is_active = 1 WHERE root_path = ?", (str(root),)
            )
            await conn.commit()

        async with conn.execute(
            "SELECT id, name, root_path, created_at, is_active "
            "FROM library WHERE root_path = ?",
            (str(root),),
        ) as cur:
            row = await cur.fetchone()
        assert row is not None
        lib = _row_to_library(row, is_active_override=True)

        # Seed or verify the system "All Beats" list (idempotent).
        await conn.execute(
            "INSERT INTO list (library_id, name, kind, position, created_at) "
            "SELECT ?, 'All Beats', 'system', 0, ? "
            "WHERE NOT EXISTS (SELECT 1 FROM list WHERE library_id = ? AND kind = 'system')",
            (lib.id, now, lib.id),
        )
        await conn.commit()

    _register(lib.name, lib.root_path, lib.created_at.isoformat())

    # Stop any previous library's watchdog observer before switching active.
    prev = state.get_active()
    if prev is not None and prev.library.id != lib.id:
        from beatos_core.watcher.daemon import stop_watcher
        stop_watcher(prev.library.id)

    await state.set_active(state.ActiveLibrary(library=lib, db_path=db_path))

    # Start watchdog observer for this library's configured folders (if any).
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT path FROM watch_folder WHERE library_id = ?", (lib.id,)
        ) as cur:
            watch_rows = await cur.fetchall()
    paths = [pathlib.Path(r[0]) for r in watch_rows if pathlib.Path(r[0]).is_dir()]
    if paths:
        from beatos_core.watcher.daemon import start_watcher
        loop = asyncio.get_running_loop()
        observer = start_watcher(lib.id, paths, loop)
        state.set_watcher(lib.id, observer)

    return lib


async def list_libraries() -> list[Library]:
    active = state.get_active()
    active_path = active.library.root_path if active else None

    libs: list[Library] = []
    for entry in _read_registry():
        libs.append(
            Library(
                id=0,
                name=entry.get("name", ""),
                root_path=entry["root_path"],
                created_at=_dt.datetime.fromisoformat(entry["created_at"]),
                is_active=(entry["root_path"] == active_path),
            )
        )
    return libs


async def get_active_library() -> Optional[Library]:
    active = state.get_active()
    if active is None:
        return None
    return active.library
