"""Approve handlers for list-curation tools."""
from __future__ import annotations

import datetime as dt

import aiosqlite

from beatos_core.two_phase import (
    RowVanishedError,
    consume_token_with_result,
    verify_token,
)
from beatos_http.routes.tokens import register_approve_handler


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


@register_approve_handler("update_list")
async def _approve_update_list(conn: aiosqlite.Connection, token: str) -> dict:
    payload = await verify_token(conn, token, expected_tool="update_list")
    list_id, name = payload["list_id"], payload["name"]
    cur = await conn.execute(
        "UPDATE list SET name=? WHERE id=? AND kind<>'system'",
        (name, list_id),
    )
    if cur.rowcount != 1:
        raise RowVanishedError(f"list id={list_id} no longer updatable")
    result = {"list_id": list_id, "name": name}
    await consume_token_with_result(conn, token, result)
    return result


@register_approve_handler("delete_list")
async def _approve_delete_list(conn: aiosqlite.Connection, token: str) -> dict:
    payload = await verify_token(conn, token, expected_tool="delete_list")
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
    result = {"list_id": list_id, "freed_membership_count": freed}
    await consume_token_with_result(conn, token, result)
    return result


@register_approve_handler("add_tracks_to_list")
async def _approve_add_tracks_to_list(conn: aiosqlite.Connection, token: str) -> dict:
    payload = await verify_token(conn, token, expected_tool="add_tracks_to_list")
    list_id = payload["list_id"]
    track_ids = payload["track_ids"]
    async with conn.execute(
        "SELECT COALESCE(MAX(position), -1) FROM track_list WHERE list_id=?", (list_id,)
    ) as c0:
        max_pos = (await c0.fetchone())[0]
    now = _now()
    added = 0
    for offset, tid in enumerate(track_ids, start=1):
        cur = await conn.execute(
            "INSERT OR IGNORE INTO track_list (list_id, track_id, position, added_at) "
            "VALUES (?, ?, ?, ?)",
            (list_id, tid, max_pos + offset, now),
        )
        if cur.rowcount != 1:
            raise RowVanishedError(f"track id={tid} could not be added (vanished?)")
        added += 1
    result = {"list_id": list_id, "added_count": added}
    await consume_token_with_result(conn, token, result)
    return result


@register_approve_handler("remove_tracks_from_list")
async def _approve_remove_tracks_from_list(
    conn: aiosqlite.Connection, token: str
) -> dict:
    payload = await verify_token(conn, token, expected_tool="remove_tracks_from_list")
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
    result = {"list_id": list_id, "removed_count": removed}
    await consume_token_with_result(conn, token, result)
    return result


@register_approve_handler("reorder_list")
async def _approve_reorder_list(conn: aiosqlite.Connection, token: str) -> dict:
    payload = await verify_token(conn, token, expected_tool="reorder_list")
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
    result = {"list_id": list_id, "count": len(track_ids)}
    await consume_token_with_result(conn, token, result)
    return result
