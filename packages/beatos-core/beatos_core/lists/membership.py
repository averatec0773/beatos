"""Track <-> List membership.

v0.0.4: global DB resolved via BEATOS_DB_PATH (or ~/Music/BeatOS/global.db).
"""
from __future__ import annotations

import datetime as _dt

import aiosqlite

from beatos_core.db import resolve_db_path
from beatos_core.models import List as ListModel
from beatos_core.models import Track
from beatos_core.tracks.service import _SELECT_COLS as _TRACK_SELECT_COLS
from beatos_core.tracks.service import _cover_subquery as _track_cover_subquery
from beatos_core.tracks.service import _deserialize as _track_from_row
from beatos_core.lists.service import _SELECT_COLS as _LIST_SELECT_COLS
from beatos_core.lists.service import _row_to_list


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


async def add_track_to_list(track_id: int, list_id: int) -> None:
    """Idempotent: adding the same track twice is a no-op."""
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            "INSERT OR IGNORE INTO track_list (track_id, list_id, position, added_at) "
            "VALUES (?, ?, 0, ?)",
            (track_id, list_id, _now()),
        )
        await conn.commit()


async def remove_track_from_list(track_id: int, list_id: int) -> None:
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            "DELETE FROM track_list WHERE track_id = ? AND list_id = ?",
            (track_id, list_id),
        )
        await conn.commit()


async def tracks_in_list(list_id: int) -> list[Track]:
    """Return tracks in a list, ordered by membership position then track id."""
    db_path = resolve_db_path()
    # Qualify each column with the `track.` prefix so the join is unambiguous.
    cols = ", ".join(f"track.{c.strip()}" for c in _TRACK_SELECT_COLS.split(","))
    cover_sq = _track_cover_subquery("track.")
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            f"SELECT {cols}, {cover_sq} FROM track "
            "INNER JOIN track_list ON track_list.track_id = track.id "
            "WHERE track_list.list_id = ? "
            "ORDER BY track_list.position, track.id",
            (list_id,),
        ) as cur:
            rows = await cur.fetchall()
    return [_track_from_row(r) for r in rows]


async def lists_for_track(track_id: int) -> list[ListModel]:
    """Return the lists a given track is a member of."""
    db_path = resolve_db_path()
    cols = ", ".join(f"list.{c.strip()}" for c in _LIST_SELECT_COLS.split(","))
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            f"SELECT {cols} FROM list "
            "INNER JOIN track_list ON track_list.list_id = list.id "
            "WHERE track_list.track_id = ? "
            "ORDER BY list.position, list.id",
            (track_id,),
        ) as cur:
            rows = await cur.fetchall()
    return [_row_to_list(r) for r in rows]
