"""List CRUD service. System lists are protected from delete."""
from __future__ import annotations

import datetime as _dt
from typing import Any, Optional

import aiosqlite

from beatos_core import state
from beatos_core.models import List as ListModel


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


def _row_to_list(row: tuple) -> ListModel:
    return ListModel(
        id=row[0],
        library_id=row[1],
        name=row[2],
        kind=row[3],
        position=row[4],
        created_at=_dt.datetime.fromisoformat(row[5]),
    )


async def list_lists() -> list[ListModel]:
    active = state.require_active()
    async with aiosqlite.connect(active.db_path) as conn:
        async with conn.execute(
            "SELECT id, library_id, name, kind, position, created_at "
            "FROM list WHERE library_id = ? ORDER BY position, id",
            (active.library.id,),
        ) as cur:
            rows = await cur.fetchall()
    return [_row_to_list(r) for r in rows]


async def get_list(list_id: int) -> Optional[ListModel]:
    active = state.require_active()
    async with aiosqlite.connect(active.db_path) as conn:
        async with conn.execute(
            "SELECT id, library_id, name, kind, position, created_at "
            "FROM list WHERE id = ? AND library_id = ?",
            (list_id, active.library.id),
        ) as cur:
            row = await cur.fetchone()
    return _row_to_list(row) if row else None


async def create_list(name: str, kind: str = "user") -> ListModel:
    if kind not in ("user", "beattape", "system"):
        raise ValueError(f"Invalid kind: {kind}")
    if kind == "system":
        raise ValueError("System lists are seeded only at library init.")
    active = state.require_active()
    async with aiosqlite.connect(active.db_path) as conn:
        async with conn.execute(
            "INSERT INTO list (library_id, name, kind, position, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (active.library.id, name, kind, 0, _now()),
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

    active = state.require_active()
    sets = []
    values: list[Any] = []
    for field, value in updates.items():
        sets.append(f"{field} = ?")
        values.append(value)
    values.append(list_id)
    values.append(active.library.id)
    async with aiosqlite.connect(active.db_path) as conn:
        await conn.execute(
            f"UPDATE list SET {', '.join(sets)} WHERE id = ? AND library_id = ?",
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

    active = state.require_active()
    async with aiosqlite.connect(active.db_path) as conn:
        await conn.execute(
            "DELETE FROM list WHERE id = ? AND library_id = ?",
            (list_id, active.library.id),
        )
        await conn.commit()
