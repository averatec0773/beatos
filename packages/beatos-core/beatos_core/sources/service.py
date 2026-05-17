"""Source CRUD service.

Sources are globally-scoped (not per-library). All operations target the
global DB resolved via BEATOS_DB_PATH (or the default ~/Music/BeatOS/global.db).
"""
from __future__ import annotations

import datetime as _dt
from pathlib import Path
from typing import Optional

import aiosqlite

from beatos_core.db import resolve_db_path
from beatos_core.sources.models import Source, SourceCreate, SourceStatus, SourceUpdate

_SELECT_COLS = "id, name, root_path, position, created_at"


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


def _row_to_source(row) -> Source:
    return Source(
        id=row[0], name=row[1], root_path=row[2], position=row[3], created_at=row[4]
    )


async def create_source(payload: SourceCreate) -> Source:
    p = Path(payload.root_path)
    if p.exists() and not p.is_dir():
        raise ValueError(f"Path is not a directory: {p}")

    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT 1 FROM source WHERE root_path = ?", (payload.root_path,)
        ) as cur:
            if await cur.fetchone() is not None:
                raise ValueError(f"Path already registered as a Source: {payload.root_path}")

        async with conn.execute(
            "INSERT INTO source (name, root_path, position, created_at) VALUES (?, ?, 0, ?)",
            (payload.name, payload.root_path, _now()),
        ) as cur:
            source_id = cur.lastrowid
        await conn.commit()

        async with conn.execute(
            f"SELECT {_SELECT_COLS} FROM source WHERE id = ?", (source_id,)
        ) as cur:
            row = await cur.fetchone()
    return _row_to_source(row)


async def get_source(source_id: int) -> Optional[Source]:
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            f"SELECT {_SELECT_COLS} FROM source WHERE id = ?", (source_id,)
        ) as cur:
            row = await cur.fetchone()
    return _row_to_source(row) if row else None


async def list_sources() -> list[Source]:
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            f"SELECT {_SELECT_COLS} FROM source ORDER BY position ASC, id ASC"
        ) as cur:
            rows = await cur.fetchall()
    return [_row_to_source(r) for r in rows]


async def update_source(source_id: int, payload: SourceUpdate) -> Optional[Source]:
    current = await get_source(source_id)
    if current is None:
        return None

    updates = payload.model_dump(exclude_none=True)
    if not updates:
        return current

    sets = [f"{field} = ?" for field in updates]
    values = list(updates.values()) + [source_id]

    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            f"UPDATE source SET {', '.join(sets)} WHERE id = ?",
            tuple(values),
        )
        await conn.commit()

    return await get_source(source_id)


async def reorder_sources(ids: list[int]) -> None:
    """Assign positions 0, 1, 2, … to sources in the given id order.

    Raises ValueError if ids is empty, contains duplicates, or references
    a source_id that doesn't exist in the table.
    """
    if not ids:
        raise ValueError("ids must not be empty")
    if len(ids) != len(set(ids)):
        raise ValueError("ids contains duplicates")

    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT id FROM source WHERE id IN (%s)" % ",".join("?" * len(ids)), ids) as cur:
            found = {r[0] for r in await cur.fetchall()}
        unknown = set(ids) - found
        if unknown:
            raise ValueError(f"Unknown source id(s): {sorted(unknown)}")

        for position, source_id in enumerate(ids):
            await conn.execute("UPDATE source SET position = ? WHERE id = ?", (position, source_id))
        await conn.commit()


async def delete_source(source_id: int) -> None:
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute("DELETE FROM source WHERE id = ?", (source_id,))
        await conn.commit()


async def find_source_for_path(abs_path: str) -> Optional[Source]:
    abs_norm = str(Path(abs_path).resolve())
    for s in await list_sources():
        root_norm = str(Path(s.root_path).resolve())
        if abs_norm == root_norm or abs_norm.startswith(root_norm + "/"):
            return s
    return None


async def get_source_status(source_id: int) -> Optional[SourceStatus]:
    """Return the live online/offline status of a Source by checking disk."""
    src = await get_source(source_id)
    if src is None:
        return None
    p = Path(src.root_path)
    status = "online" if p.is_dir() else "offline"
    return SourceStatus(source_id=source_id, status=status, last_checked_at=_now())
