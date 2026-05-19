"""Lifecycle tools: trash_tracks, restore_tracks, purge_tracks.

Each issues a single 2PC token whose payload carries `ids` + pre-baked
`preview`. The actual UPDATE/DELETE happens in beatos-http handler at
approve time, all in one transaction (RowVanishedError → rollback all)."""
from __future__ import annotations

import aiosqlite

from beatos_core.two_phase import create_token
from beatos_mcp.db import connect_writable
from beatos_mcp.preview import build_preview, format_track_sample

_MAX_IDS = 500


def _validate_ids(ids: list[int]) -> None:
    if not isinstance(ids, list) or not ids:
        raise ValueError("ids must be a non-empty list of integers")
    if len(ids) > _MAX_IDS:
        raise ValueError(f"ids list too large: max {_MAX_IDS}")
    if not all(isinstance(x, int) for x in ids):
        raise ValueError("ids must contain only integers")


async def _fetch_titles(
    conn: aiosqlite.Connection, ids: list[int]
) -> dict[int, tuple[str, str | None]]:
    """Returns {id: (title, deleted_at)} for ids that exist."""
    if not ids:
        return {}
    placeholders = ",".join("?" * len(ids))
    async with conn.execute(
        f"SELECT id, title, deleted_at FROM track WHERE id IN ({placeholders})",
        ids,
    ) as cur:
        rows = await cur.fetchall()
    return {r[0]: (r[1], r[2]) for r in rows}


async def _emit_token(tool_name: str, payload: dict) -> dict:
    async with connect_writable() as conn:
        token = await create_token(conn, tool_name=tool_name, payload=payload)
        async with conn.execute(
            "SELECT expires_at FROM tokens WHERE token=?", (token,)
        ) as cur:
            row = await cur.fetchone()
    return {
        "token": token,
        "expires_at": row[0],
        "message": "Awaiting human approval. Open BeatOS → Approvals.",
    }


async def trash_tracks(ids: list[int]) -> dict:
    _validate_ids(ids)
    async with connect_writable() as conn:
        info = await _fetch_titles(conn, ids)
    warnings: list[str] = []
    missing = [i for i in ids if i not in info]
    if missing:
        warnings.append(f"{len(missing)} of {len(ids)} ids not found, will be skipped")
    already_trashed = [i for i, (_, d) in info.items() if d is not None]
    if already_trashed:
        warnings.append(f"{len(already_trashed)} already in trash, will be skipped")
    keep = [i for i in ids if i in info and info[i][1] is None]
    sample_rows = [(i, info[i][0]) for i in keep[:5]]
    payload = {
        "ids": keep,
        "preview": build_preview(
            headline=f"Trash {len(keep)} tracks",
            sample=format_track_sample(sample_rows),
            warnings=warnings,
        ),
    }
    return await _emit_token("trash_tracks", payload)


async def restore_tracks(ids: list[int]) -> dict:
    _validate_ids(ids)
    async with connect_writable() as conn:
        info = await _fetch_titles(conn, ids)
    warnings: list[str] = []
    missing = [i for i in ids if i not in info]
    if missing:
        warnings.append(f"{len(missing)} of {len(ids)} ids not found, will be skipped")
    not_trashed = [i for i, (_, d) in info.items() if d is None]
    if not_trashed:
        warnings.append(f"{len(not_trashed)} not in trash, will be skipped")
    keep = [i for i in ids if i in info and info[i][1] is not None]
    sample_rows = [(i, info[i][0]) for i in keep[:5]]
    payload = {
        "ids": keep,
        "preview": build_preview(
            headline=f"Restore {len(keep)} tracks from trash",
            sample=format_track_sample(sample_rows),
            warnings=warnings,
        ),
    }
    return await _emit_token("restore_tracks", payload)


async def purge_tracks(ids: list[int]) -> dict:
    _validate_ids(ids)
    async with connect_writable() as conn:
        info = await _fetch_titles(conn, ids)
    warnings: list[str] = []
    missing = [i for i in ids if i not in info]
    if missing:
        warnings.append(f"{len(missing)} of {len(ids)} ids not found, will be skipped")
    keep = [i for i in ids if i in info]
    sample_rows = [(i, info[i][0]) for i in keep[:5]]
    payload = {
        "ids": keep,
        "preview": build_preview(
            headline=f"PERMANENTLY delete {len(keep)} tracks",
            sample=format_track_sample(sample_rows),
            warnings=warnings,
            risk="destructive",
        ),
    }
    return await _emit_token("purge_tracks", payload)
