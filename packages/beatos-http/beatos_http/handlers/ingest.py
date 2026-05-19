"""Approve handlers for create_tracks + attach_assets + detach_assets."""
from __future__ import annotations

import datetime as dt
import json
import mimetypes
import os
import sqlite3

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


@register_approve_handler("attach_assets")
async def _approve_attach_assets(conn: aiosqlite.Connection, token: str) -> dict:
    """Atomic batch attach. If ANY item fails (file vanished, track vanished),
    the entire batch is unwound (caller's transaction will be rolled back via
    RowVanishedError → 409).
    """
    payload = await verify_token(conn, token, expected_tool="attach_assets")
    items = payload["items"]
    now = _now()

    # Re-check every file exists before writing anything. This pre-scan is cheap
    # (stat per item) and keeps the partial-write window vanishingly small.
    for it in items:
        if not os.path.isfile(it["path"]):
            raise RowVanishedError(f"asset file no longer exists: {it['path']}")

    results: list[dict] = []
    try:
        for it in items:
            track_id = it["track_id"]
            role = it["role"]
            path = it["path"]
            size = os.path.getsize(path)
            mime, _ = mimetypes.guess_type(path)
            async with conn.execute(
                "SELECT id FROM asset WHERE track_id=? AND role=?", (track_id, role)
            ) as c0:
                existing = await c0.fetchone()
            if existing is None:
                cur = await conn.execute(
                    "INSERT INTO asset (track_id, role, abs_path, size_bytes, mime, "
                    "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (track_id, role, path, size, mime, now, now),
                )
                asset_id = cur.lastrowid
                replaced = False
            else:
                asset_id = existing[0]
                await conn.execute(
                    "UPDATE asset SET abs_path=?, size_bytes=?, mime=?, updated_at=? "
                    "WHERE id=?",
                    (path, size, mime, now, asset_id),
                )
                replaced = True
            results.append(
                {
                    "track_id": track_id,
                    "role": role,
                    "asset_id": asset_id,
                    "replaced": replaced,
                }
            )
    except sqlite3.IntegrityError as e:
        # FK violation: a track was deleted between token issuance and approve.
        raise RowVanishedError(f"track row vanished mid-approve: {e}") from e

    result = {"results": results}
    await consume_token_with_result(conn, token, result)
    return result


@register_approve_handler("detach_assets")
async def _approve_detach_assets(conn: aiosqlite.Connection, token: str) -> dict:
    """Atomic batch detach. Idempotent: items whose asset is already gone are
    recorded with removed=False but do NOT fail the batch.
    """
    payload = await verify_token(conn, token, expected_tool="detach_assets")
    items = payload["items"]

    results: list[dict] = []
    for it in items:
        track_id = it["track_id"]
        role = it["role"]
        cur = await conn.execute(
            "DELETE FROM asset WHERE track_id=? AND role=?", (track_id, role)
        )
        results.append(
            {
                "track_id": track_id,
                "role": role,
                "removed": cur.rowcount > 0,
            }
        )

    result = {"results": results}
    await consume_token_with_result(conn, token, result)
    return result
