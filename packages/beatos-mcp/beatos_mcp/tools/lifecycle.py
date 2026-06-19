"""Lifecycle tools: trash_tracks, restore_tracks, purge_tracks.

Each validates ids, builds a `preview`, then routes through `submit_write`, which
applies the UPDATE/DELETE directly (beatos-http handler, one transaction;
RowVanishedError → rollback) and records the action in the agent_action_log."""
from __future__ import annotations

import aiosqlite

from beatos_mcp.db import connect_writable
from beatos_mcp.policy import submit_write
from beatos_mcp.preview import build_preview, format_track_sample
from beatos_mcp.validate import validate_ids


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


async def _apply_write(tool_name: str, payload: dict) -> dict:
    # Routes through the policy chokepoint: applies directly (enabled) or
    # refuses (read_only); the action is recorded in the agent_action_log.
    return await submit_write(tool_name, payload)


async def trash_tracks(ids: list[int]) -> dict:
    validate_ids(ids)
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
    if not keep:
        reasons = []
        if missing:
            reasons.append(f"{len(missing)} not found")
        if already_trashed:
            reasons.append(f"{len(already_trashed)} already in trash")
        raise ValueError("nothing to trash — " + ", ".join(reasons))
    sample_rows = [(i, info[i][0]) for i in keep[:5]]
    payload = {
        "ids": keep,
        "preview": build_preview(
            headline=f"Trash {len(keep)} tracks",
            sample=format_track_sample(sample_rows),
            warnings=warnings,
        ),
    }
    return await _apply_write("trash_tracks", payload)


async def restore_tracks(ids: list[int]) -> dict:
    validate_ids(ids)
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
    if not keep:
        reasons = []
        if missing:
            reasons.append(f"{len(missing)} not found")
        if not_trashed:
            reasons.append(f"{len(not_trashed)} not in trash")
        raise ValueError("nothing to restore — " + ", ".join(reasons))
    sample_rows = [(i, info[i][0]) for i in keep[:5]]
    payload = {
        "ids": keep,
        "preview": build_preview(
            headline=f"Restore {len(keep)} tracks from trash",
            sample=format_track_sample(sample_rows),
            warnings=warnings,
        ),
    }
    return await _apply_write("restore_tracks", payload)


async def purge_tracks(ids: list[int]) -> dict:
    validate_ids(ids)
    async with connect_writable() as conn:
        info = await _fetch_titles(conn, ids)
    warnings: list[str] = []
    missing = [i for i in ids if i not in info]
    if missing:
        warnings.append(f"{len(missing)} of {len(ids)} ids not found, will be skipped")
    keep = [i for i in ids if i in info]
    if not keep:
        raise ValueError("all provided ids were not found")
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
    return await _apply_write("purge_tracks", payload)
