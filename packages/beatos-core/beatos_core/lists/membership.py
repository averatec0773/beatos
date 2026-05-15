"""Track <-> List membership."""
from __future__ import annotations

import datetime as _dt

import aiosqlite

from beatos_core import state
from beatos_core.models import Track
from beatos_core.tracks.service import _SELECT_COLS, _deserialize  # noqa: PLC2701


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


async def add_track_to_list(track_id: int, list_id: int) -> None:
    """Idempotent: adding the same track twice is a no-op."""
    active = state.require_active()
    async with aiosqlite.connect(active.db_path) as conn:
        await conn.execute(
            "INSERT OR IGNORE INTO track_list (track_id, list_id, position, added_at) "
            "VALUES (?, ?, 0, ?)",
            (track_id, list_id, _now()),
        )
        await conn.commit()
    _ = active


async def remove_track_from_list(track_id: int, list_id: int) -> None:
    active = state.require_active()
    async with aiosqlite.connect(active.db_path) as conn:
        await conn.execute(
            "DELETE FROM track_list WHERE track_id = ? AND list_id = ?",
            (track_id, list_id),
        )
        await conn.commit()
    _ = active


async def tracks_in_list(list_id: int) -> list[Track]:
    active = state.require_active()
    async with aiosqlite.connect(active.db_path) as conn:
        async with conn.execute(
            f"SELECT {_SELECT_COLS} FROM track "
            "INNER JOIN track_list ON track_list.track_id = track.id "
            "WHERE track_list.list_id = ? AND track.library_id = ? "
            "ORDER BY track_list.position, track.created_at",
            (list_id, active.library.id),
        ) as cur:
            rows = await cur.fetchall()
    return [_deserialize(r) for r in rows]
