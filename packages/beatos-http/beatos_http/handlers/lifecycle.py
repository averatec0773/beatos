"""Approve handlers for trash_tracks, restore_tracks, purge_tracks."""
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


@register_approve_handler("trash_tracks")
async def _approve_trash_tracks(conn: aiosqlite.Connection, token: str) -> dict:
    payload = await verify_token(conn, token, expected_tool="trash_tracks")
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
    result = {"trashed_count": len(ids), "ids": list(ids)}
    await consume_token_with_result(conn, token, result)
    return result


@register_approve_handler("restore_tracks")
async def _approve_restore_tracks(conn: aiosqlite.Connection, token: str) -> dict:
    payload = await verify_token(conn, token, expected_tool="restore_tracks")
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
    result = {"restored_count": len(ids), "ids": list(ids)}
    await consume_token_with_result(conn, token, result)
    return result


@register_approve_handler("purge_tracks")
async def _approve_purge_tracks(conn: aiosqlite.Connection, token: str) -> dict:
    payload = await verify_token(conn, token, expected_tool="purge_tracks")
    ids = payload["ids"]
    for tid in ids:
        cur = await conn.execute("DELETE FROM track WHERE id=?", (tid,))
        if cur.rowcount != 1:
            raise RowVanishedError(f"track id={tid} no longer exists")
    result = {"purged_count": len(ids), "ids": list(ids)}
    await consume_token_with_result(conn, token, result)
    return result
