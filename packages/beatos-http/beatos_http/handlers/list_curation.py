"""Direct-apply handlers for list-curation tools."""
from __future__ import annotations

import datetime as dt
import sqlite3

import aiosqlite

from beatos_core.approvals import (
    RowVanishedError,
    register_apply_handler as register_approve_handler,
)


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


@register_approve_handler("create_list")
async def _approve_create_list(conn: aiosqlite.Connection, payload: dict) -> dict:
    name = payload["name"]
    cur = await conn.execute(
        "INSERT INTO list (name, kind, position, created_at) VALUES (?, 'user', 0, ?)",
        (name, _now()),
    )
    return {"list_id": cur.lastrowid, "name": name}


@register_approve_handler("update_list")
async def _approve_update_list(conn: aiosqlite.Connection, payload: dict) -> dict:
    list_id, name = payload["list_id"], payload["name"]
    cur = await conn.execute(
        "UPDATE list SET name=? WHERE id=? AND kind<>'system'",
        (name, list_id),
    )
    if cur.rowcount != 1:
        raise RowVanishedError(f"list id={list_id} no longer updatable")
    return {"list_id": list_id, "name": name}


@register_approve_handler("delete_list")
async def _approve_delete_list(conn: aiosqlite.Connection, payload: dict) -> dict:
    list_id = payload["list_id"]
    # Capture pre-delete member count for return shape
    async with conn.execute(
        "SELECT COUNT(*) FROM track_list WHERE list_id=?", (list_id,)
    ) as c0:
        freed = (await c0.fetchone())[0]
    cur = await conn.execute(
        "DELETE FROM list WHERE id=? AND kind<>'system'", (list_id,)
    )
    if cur.rowcount != 1:
        raise RowVanishedError(f"list id={list_id} no longer deletable")
    return {"list_id": list_id, "freed_membership_count": freed}


@register_approve_handler("add_tracks_to_list")
async def _approve_add_tracks_to_list(conn: aiosqlite.Connection, payload: dict) -> dict:
    list_id = payload["list_id"]
    track_ids = payload["track_ids"]
    async with conn.execute(
        "SELECT COALESCE(MAX(position), -1) FROM track_list WHERE list_id=?", (list_id,)
    ) as c0:
        max_pos = (await c0.fetchone())[0]
    now = _now()
    added = 0
    for offset, tid in enumerate(track_ids, start=1):
        try:
            cur = await conn.execute(
                "INSERT OR IGNORE INTO track_list (list_id, track_id, position, added_at) "
                "VALUES (?, ?, ?, ?)",
                (list_id, tid, max_pos + offset, now),
            )
        except sqlite3.IntegrityError as e:
            raise RowVanishedError(f"track id={tid} no longer exists (FK violation)") from e
        if cur.rowcount != 1:
            raise RowVanishedError(f"track id={tid} already in list or vanished")
        added += 1
    return {"list_id": list_id, "added_count": added}


@register_approve_handler("remove_tracks_from_list")
async def _approve_remove_tracks_from_list(
    conn: aiosqlite.Connection, payload: dict
) -> dict:
    list_id = payload["list_id"]
    track_ids = payload["track_ids"]
    removed = 0
    for tid in track_ids:
        cur = await conn.execute(
            "DELETE FROM track_list WHERE list_id=? AND track_id=?", (list_id, tid)
        )
        if cur.rowcount != 1:
            raise RowVanishedError(f"track id={tid} vanished from list {list_id}")
        removed += 1
    return {"list_id": list_id, "removed_count": removed}


@register_approve_handler("reorder_list")
async def _approve_reorder_list(conn: aiosqlite.Connection, payload: dict) -> dict:
    list_id = payload["list_id"]
    track_ids = payload["track_ids"]
    for idx, tid in enumerate(track_ids):
        cur = await conn.execute(
            "UPDATE track_list SET position=? WHERE list_id=? AND track_id=?",
            (idx, list_id, tid),
        )
        if cur.rowcount != 1:
            raise RowVanishedError(
                f"track id={tid} no longer in list {list_id}"
            )
    return {"list_id": list_id, "count": len(track_ids)}
