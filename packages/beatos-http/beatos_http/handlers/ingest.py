"""Approve handlers for create_tracks + attach_assets + detach_assets."""
from __future__ import annotations

import datetime as dt
import json
import mimetypes
import os
import sqlite3

import aiosqlite

from beatos_core.tracks.service import canonicalize_producers
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


async def _read_setting(conn: aiosqlite.Connection, key: str):
    """Read a JSON app_setting on the SAME connection (the approve handler runs
    inside one transaction — opening a second connection would risk a lock)."""
    async with conn.execute(
        "SELECT value_json FROM app_setting WHERE key = ?", (key,)
    ) as cur:
        row = await cur.fetchone()
    if row is None or row[0] is None:
        return None
    try:
        return json.loads(row[0])
    except (ValueError, TypeError):
        return None


async def _apply_creation_defaults(conn: aiosqlite.Connection, track_id: int, now: str) -> None:
    """Apply the user's configured creation defaults to a freshly-created track.

    These defaults (`default_is_free`, `default_license_tiers`) were previously
    applied ONLY by the renderer after a UI create, so tracks created through the
    MCP `create_tracks` path (server-side, no renderer) silently skipped them
    (caught dogfooding 2026-06-04: an MCP-imported track had no license/is_free,
    so the publish engine had nothing to fill in 授权设置). Apply them here so
    every creation path lands the same catalog state. Best-effort per setting —
    a malformed value must not fail the batch."""
    if await _read_setting(conn, "default_is_free") is True:
        await conn.execute(
            "UPDATE track SET is_free = 1, updated_at = ? WHERE id = ?", (now, track_id)
        )
    tiers = await _read_setting(conn, "default_license_tiers")
    if isinstance(tiers, list):
        for pos, tpl in enumerate(tiers):
            if not isinstance(tpl, dict):
                continue
            await conn.execute(
                "INSERT INTO license_tier (track_id, position, name, deliverables, "
                "prices_json, notes, created_at, updated_at, share) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    track_id,
                    pos,
                    str(tpl.get("name") or ""),
                    json.dumps(tpl.get("deliverables") or []),
                    json.dumps(tpl.get("prices") or {}),
                    tpl.get("notes"),
                    now,
                    now,
                    tpl.get("share"),
                ),
            )


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
                if f == "producer":
                    # Reuse an existing producer's casing on a case-insensitive
                    # match (agents over MCP otherwise create 'metro' alongside
                    # 'Metro'). Same conn → sees producers added earlier in batch.
                    canon = await canonicalize_producers(it[f], conn=conn)
                    params.append(json.dumps(canon))
                else:
                    params.append(json.dumps(it[f]))
        cur = await conn.execute(
            f"INSERT INTO track ({', '.join(cols)}) "
            f"VALUES ({', '.join('?' * len(params))})",
            params,
        )
        track_id = cur.lastrowid
        await _apply_creation_defaults(conn, track_id, now)
        created_ids.append(track_id)
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
