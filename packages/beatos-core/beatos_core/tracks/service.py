"""Track CRUD service.

All operations run against the currently-active library's db (state module).
Rejects writes to description_draft (sacred — charter §18 rule 4).
"""
from __future__ import annotations

import datetime as _dt
import json
from typing import Any, Optional

import aiosqlite

from beatos_core import state
from beatos_core.models import Track

_WRITABLE_FIELDS = {
    "title",
    "bpm",
    "key_signature",
    "genre",
    "mood",
    "tags",
    "description",
    "license_type",
    "price",
    "platform_data",
}

_FORBIDDEN_FIELDS = {"description_draft"}


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


def _serialize(value: Any, field: str) -> Any:
    if field in ("tags", "platform_data") and value is not None:
        return json.dumps(value)
    return value


def _deserialize(row: tuple) -> Track:
    tags = json.loads(row[7]) if row[7] else None
    platform_data = json.loads(row[12]) if row[12] else None
    return Track(
        id=row[0],
        library_id=row[1],
        title=row[2],
        bpm=row[3],
        key_signature=row[4],
        genre=row[5],
        mood=row[6],
        tags=tags,
        description=row[8],
        description_draft=row[9],
        license_type=row[10],
        price=row[11],
        platform_data=platform_data,
        created_at=_dt.datetime.fromisoformat(row[13]),
        updated_at=_dt.datetime.fromisoformat(row[14]),
    )


_SELECT_COLS = (
    "id, library_id, title, bpm, key_signature, genre, mood, "
    "tags, description, description_draft, license_type, price, "
    "platform_data, created_at, updated_at"
)


async def create_track(title: str) -> Track:
    active = state.require_active()
    now = _now()

    async with aiosqlite.connect(active.db_path) as conn:
        async with conn.execute(
            "INSERT INTO track (library_id, title, license_type, created_at, updated_at) "
            "VALUES (?, ?, 'lease_basic', ?, ?)",
            (active.library.id, title, now, now),
        ) as cur:
            track_id = cur.lastrowid
        await conn.commit()
        async with conn.execute(
            f"SELECT {_SELECT_COLS} FROM track WHERE id = ?", (track_id,)
        ) as cur:
            row = await cur.fetchone()
    return _deserialize(row)


async def list_tracks() -> list[Track]:
    active = state.require_active()
    async with aiosqlite.connect(active.db_path) as conn:
        async with conn.execute(
            f"SELECT {_SELECT_COLS} FROM track WHERE library_id = ? ORDER BY created_at",
            (active.library.id,),
        ) as cur:
            rows = await cur.fetchall()
    return [_deserialize(r) for r in rows]


async def get_track(track_id: int) -> Optional[Track]:
    active = state.require_active()
    async with aiosqlite.connect(active.db_path) as conn:
        async with conn.execute(
            f"SELECT {_SELECT_COLS} FROM track WHERE id = ? AND library_id = ?",
            (track_id, active.library.id),
        ) as cur:
            row = await cur.fetchone()
    return _deserialize(row) if row else None


async def update_track(track_id: int, updates: dict[str, Any]) -> Track:
    forbidden = set(updates.keys()) & _FORBIDDEN_FIELDS
    if forbidden:
        raise ValueError(f"Cannot update sacred field(s): {sorted(forbidden)}")

    unknown = set(updates.keys()) - _WRITABLE_FIELDS
    if unknown:
        raise ValueError(f"Unknown field(s): {sorted(unknown)}")

    if not updates:
        current = await get_track(track_id)
        if current is None:
            raise ValueError(f"Track {track_id} not found.")
        return current

    active = state.require_active()
    sets = []
    values: list[Any] = []
    for field, value in updates.items():
        sets.append(f"{field} = ?")
        values.append(_serialize(value, field))
    sets.append("updated_at = ?")
    values.append(_now())
    values.append(track_id)
    values.append(active.library.id)

    async with aiosqlite.connect(active.db_path) as conn:
        await conn.execute(
            f"UPDATE track SET {', '.join(sets)} WHERE id = ? AND library_id = ?",
            tuple(values),
        )
        await conn.commit()

    current = await get_track(track_id)
    if current is None:
        raise ValueError(f"Track {track_id} not found.")
    return current


async def delete_track(track_id: int) -> None:
    active = state.require_active()
    async with aiosqlite.connect(active.db_path) as conn:
        await conn.execute(
            "DELETE FROM track WHERE id = ? AND library_id = ?",
            (track_id, active.library.id),
        )
        await conn.commit()
