"""List CRUD service.

v0.0.4: lists are global (no library). All operations target the global DB
resolved via BEATOS_DB_PATH (or ~/Music/BeatOS/global.db).
System lists are protected from delete.
"""
from __future__ import annotations

import datetime as _dt
from typing import Any, Optional

import aiosqlite

from beatos_core.db import resolve_db_path
from beatos_core.models import List as ListModel

_SELECT_COLS = "id, name, kind, position, created_at"


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


def _row_to_list(row: tuple) -> ListModel:
    return ListModel(
        id=row[0],
        name=row[1],
        kind=row[2],
        position=row[3],
        created_at=_dt.datetime.fromisoformat(row[4]),
    )


async def list_lists() -> list[ListModel]:
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            f"SELECT {_SELECT_COLS} FROM list ORDER BY position ASC, id ASC"
        ) as cur:
            rows = await cur.fetchall()
    return [_row_to_list(r) for r in rows]


async def get_list(list_id: int) -> Optional[ListModel]:
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            f"SELECT {_SELECT_COLS} FROM list WHERE id = ?", (list_id,)
        ) as cur:
            row = await cur.fetchone()
    return _row_to_list(row) if row else None


async def create_list(name: str, kind: str = "user") -> ListModel:
    if kind not in ("user", "beattape", "system"):
        raise ValueError(f"Invalid kind: {kind}")
    if kind == "system":
        raise ValueError("System lists are seeded only at schema init.")
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "INSERT INTO list (name, kind, position, created_at) VALUES (?, ?, 0, ?)",
            (name, kind, _now()),
        ) as cur:
            list_id = cur.lastrowid
        await conn.commit()
    return await get_list(list_id)  # type: ignore[return-value]


_WRITABLE = {"name", "position"}


async def update_list(list_id: int, updates: dict[str, Any]) -> ListModel:
    unknown = set(updates.keys()) - _WRITABLE
    if unknown:
        raise ValueError(f"Unknown fields: {sorted(unknown)}")
    if not updates:
        existing = await get_list(list_id)
        if existing is None:
            raise ValueError(f"List {list_id} not found.")
        return existing

    sets = []
    values: list[Any] = []
    for field, value in updates.items():
        sets.append(f"{field} = ?")
        values.append(value)
    values.append(list_id)
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            f"UPDATE list SET {', '.join(sets)} WHERE id = ?",
            tuple(values),
        )
        await conn.commit()
    return await get_list(list_id)  # type: ignore[return-value]


async def delete_list(list_id: int) -> None:
    """Delete a list. System lists are protected."""
    existing = await get_list(list_id)
    if existing is None:
        raise ValueError(f"List {list_id} not found.")
    if existing.kind == "system":
        raise ValueError("Cannot delete a system list.")

    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute("DELETE FROM list WHERE id = ?", (list_id,))
        await conn.commit()
