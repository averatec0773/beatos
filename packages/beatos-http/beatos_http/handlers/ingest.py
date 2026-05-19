"""Approve handlers for create_tracks + attach_asset."""
from __future__ import annotations

import datetime as dt
import json
import os

import aiosqlite

from beatos_core.two_phase import (
    RowVanishedError,
    consume_token_with_result,
    verify_token,
)
from beatos_http.routes.tokens import register_approve_handler


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


_FIELD_TO_COL = {
    "title": "title",
    "bpm": "bpm",
    "key": "key_signature",
}


@register_approve_handler("create_tracks")
async def _approve_create_tracks(conn: aiosqlite.Connection, token: str) -> dict:
    payload = await verify_token(conn, token, expected_tool="create_tracks")
    items = payload["items"]
    now = _now()
    created_ids: list[int] = []
    for it in items:
        cols = ["title", "created_at", "updated_at"]
        params: list = [it["title"], now, now]
        for f in ("bpm", "key"):
            if f in it and it[f] is not None:
                cols.append(_FIELD_TO_COL[f])
                params.append(it[f])
        for f in ("producer", "genre", "mood"):
            if f in it and it[f] is not None:
                cols.append(f)
                params.append(json.dumps(it[f]))
        cur = await conn.execute(
            f"INSERT INTO track ({', '.join(cols)}) "
            f"VALUES ({', '.join('?' * len(params))})",
            params,
        )
        created_ids.append(cur.lastrowid)
    result = {"created_ids": created_ids}
    await consume_token_with_result(conn, token, result)
    return result


@register_approve_handler("attach_asset")
async def _approve_attach_asset(conn: aiosqlite.Connection, token: str) -> dict:
    payload = await verify_token(conn, token, expected_tool="attach_asset")
    track_id = payload["track_id"]
    role = payload["role"]
    path = payload["path"]
    if not os.path.isfile(path):
        raise RowVanishedError(f"asset file no longer exists: {path}")
    now = _now()
    size = os.path.getsize(path)
    async with conn.execute(
        "SELECT id FROM asset WHERE track_id=? AND role=?", (track_id, role)
    ) as c0:
        existing = await c0.fetchone()
    if existing is None:
        cur = await conn.execute(
            "INSERT INTO asset (track_id, role, abs_path, size_bytes, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (track_id, role, path, size, now, now),
        )
        asset_id = cur.lastrowid
        replaced = False
    else:
        asset_id = existing[0]
        await conn.execute(
            "UPDATE asset SET abs_path=?, size_bytes=?, updated_at=? WHERE id=?",
            (path, size, now, asset_id),
        )
        replaced = True
    result = {"asset_id": asset_id, "replaced": replaced}
    await consume_token_with_result(conn, token, result)
    return result
