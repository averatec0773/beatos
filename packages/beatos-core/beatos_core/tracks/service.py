"""Track CRUD service.

v0.0.4: tracks are global (no library). All operations target the global DB
resolved via BEATOS_DB_PATH (or ~/Music/BeatOS/global.db).
Rejects writes to description_draft (sacred — charter §18 rule 4).
"""
from __future__ import annotations

import datetime as _dt
import json
from typing import Any, Optional

import aiosqlite

from beatos_core.db import resolve_db_path
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
    "producer",
}

_FORBIDDEN_FIELDS = {"description_draft"}


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


def _serialize(value: Any, field: str) -> Any:
    if field == "tags" and value is not None:
        return json.dumps(value)
    return value


_SELECT_COLS = (
    "id, title, bpm, key_signature, genre, mood, "
    "tags, description, description_draft, license_type, price, "
    "producer, "
    "created_at, updated_at"
)

# Subquery rendered after _SELECT_COLS to populate Track.cover_asset_id.
# Uses a distinct alias `ax` for the inner asset reference so it cannot
# shadow an outer `asset a` join (e.g. source_id filter route).
_COVER_SUBQUERY_TEMPLATE = (
    "(SELECT ax.id FROM asset ax "
    "WHERE ax.track_id = {prefix}id AND ax.role = 'cover' LIMIT 1) AS cover_asset_id"
)

# Subquery to derive has_audio: EXISTS over non-missing audio assets.
# Uses alias `ax2` to avoid collision with the cover subquery alias `ax`.
_HAS_AUDIO_SUBQUERY_TEMPLATE = (
    "EXISTS (SELECT 1 FROM asset ax2 "
    "WHERE ax2.track_id = {prefix}id "
    "AND ax2.missing = 0 "
    "AND ax2.role IN ('audio_tagged_mp3','audio_untagged_mp3','audio_tagged_wav','audio_untagged_wav')"
    ") AS has_audio"
)


def _cover_subquery(prefix: str = "track.") -> str:
    """Render the cover-id correlated subquery for a given outer-table alias.

    `prefix` is the outer table reference including dot, e.g. "track." or "t.".
    Defaults to "track." for unaliased queries.
    """
    return _COVER_SUBQUERY_TEMPLATE.format(prefix=prefix)


def _has_audio_subquery(prefix: str = "track.") -> str:
    """Render the has_audio EXISTS subquery for a given outer-table alias."""
    return _HAS_AUDIO_SUBQUERY_TEMPLATE.format(prefix=prefix)


def _deserialize(row: tuple) -> Track:
    # Row layout (0-based):
    # 0:id, 1:title, 2:bpm, 3:key_signature, 4:genre, 5:mood,
    # 6:tags, 7:description, 8:description_draft, 9:license_type, 10:price,
    # 11:producer, 12:created_at, 13:updated_at,
    # 14:cover_asset_id (optional), 15:has_audio (optional)
    tags = json.loads(row[6]) if row[6] else None
    return Track(
        id=row[0],
        title=row[1],
        bpm=row[2],
        key_signature=row[3],
        genre=row[4],
        mood=row[5],
        tags=tags,
        description=row[7],
        description_draft=row[8],
        license_type=row[9],
        price=row[10],
        producer=row[11],
        created_at=_dt.datetime.fromisoformat(row[12]),
        updated_at=_dt.datetime.fromisoformat(row[13]),
        cover_asset_id=row[14] if len(row) > 14 else None,
        has_audio=bool(row[15]) if len(row) > 15 else False,
    )


async def create_track(title: str) -> Track:
    now = _now()
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "INSERT INTO track (title, license_type, created_at, updated_at) "
            "VALUES (?, 'lease_basic', ?, ?)",
            (title, now, now),
        ) as cur:
            track_id = cur.lastrowid
        await conn.commit()
        async with conn.execute(
            f"SELECT {_SELECT_COLS}, {_cover_subquery()}, {_has_audio_subquery()} FROM track WHERE id = ?",
            (track_id,),
        ) as cur:
            row = await cur.fetchone()
    return _deserialize(row)


async def list_tracks() -> list[Track]:
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            f"SELECT {_SELECT_COLS}, {_cover_subquery()}, {_has_audio_subquery()} FROM track ORDER BY updated_at DESC"
        ) as cur:
            rows = await cur.fetchall()
    return [_deserialize(r) for r in rows]


async def get_track(track_id: int) -> Optional[Track]:
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            f"SELECT {_SELECT_COLS}, {_cover_subquery()}, {_has_audio_subquery()} FROM track WHERE id = ?",
            (track_id,),
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

    sets: list[str] = []
    values: list[Any] = []
    for field, value in updates.items():
        sets.append(f"{field} = ?")
        values.append(_serialize(value, field))
    sets.append("updated_at = ?")
    values.append(_now())
    values.append(track_id)

    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            f"UPDATE track SET {', '.join(sets)} WHERE id = ?",
            tuple(values),
        )
        await conn.commit()

    current = await get_track(track_id)
    if current is None:
        raise ValueError(f"Track {track_id} not found.")
    return current


async def delete_track(track_id: int) -> None:
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute("DELETE FROM track WHERE id = ?", (track_id,))
        await conn.commit()
