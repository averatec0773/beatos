"""Direct-apply handlers for trash_tracks, restore_tracks, purge_tracks."""
from __future__ import annotations

import datetime as dt

import aiosqlite

from beatos_core.approvals import (
    RowVanishedError,
    register_apply_handler as register_approve_handler,
)


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


@register_approve_handler("trash_tracks")
async def _approve_trash_tracks(conn: aiosqlite.Connection, payload: dict) -> dict:
    ids = payload["ids"]
    now = _now()
    for tid in ids:
        cur = await conn.execute(
            "UPDATE track SET deleted_at=?, updated_at=? "
            "WHERE id=? AND deleted_at IS NULL",
            (now, now, tid),
        )
        if cur.rowcount != 1:
            raise RowVanishedError(f"track id={tid} no longer eligible for trash")
    return {"trashed_count": len(ids), "ids": list(ids)}


@register_approve_handler("restore_tracks")
async def _approve_restore_tracks(conn: aiosqlite.Connection, payload: dict) -> dict:
    ids = payload["ids"]
    now = _now()
    for tid in ids:
        cur = await conn.execute(
            "UPDATE track SET deleted_at=NULL, updated_at=? "
            "WHERE id=? AND deleted_at IS NOT NULL",
            (now, tid),
        )
        if cur.rowcount != 1:
            raise RowVanishedError(f"track id={tid} no longer eligible for restore")
    return {"restored_count": len(ids), "ids": list(ids)}


@register_approve_handler("purge_tracks")
async def _approve_purge_tracks(conn: aiosqlite.Connection, payload: dict) -> dict:
    ids = payload["ids"]
    for tid in ids:
        cur = await conn.execute("DELETE FROM track WHERE id=?", (tid,))
        if cur.rowcount != 1:
            raise RowVanishedError(f"track id={tid} no longer exists")
    return {"purged_count": len(ids), "ids": list(ids)}
