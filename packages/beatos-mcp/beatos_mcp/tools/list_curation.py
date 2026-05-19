"""List-curation MCP tools: update_list, delete_list, add/remove_tracks_to_list, reorder_list."""
from __future__ import annotations

import aiosqlite

from beatos_core.two_phase import create_token
from beatos_mcp.db import connect_writable
from beatos_mcp.preview import build_preview, format_track_sample
from beatos_mcp.validate import validate_ids

_MAX_NAME = 200


async def _fetch_list(conn: aiosqlite.Connection, list_id: int) -> tuple[str, str] | None:
    async with conn.execute(
        "SELECT name, kind FROM list WHERE id=?", (list_id,)
    ) as cur:
        return await cur.fetchone()


async def _list_members(conn: aiosqlite.Connection, list_id: int) -> set[int]:
    async with conn.execute(
        "SELECT track_id FROM track_list WHERE list_id=?", (list_id,)
    ) as cur:
        return {r[0] for r in await cur.fetchall()}


async def _track_titles(
    conn: aiosqlite.Connection, ids: list[int]
) -> dict[int, str]:
    if not ids:
        return {}
    ph = ",".join("?" * len(ids))
    async with conn.execute(
        f"SELECT id, title FROM track WHERE id IN ({ph})", ids
    ) as cur:
        return {r[0]: r[1] for r in await cur.fetchall()}


async def _emit(tool: str, payload: dict) -> dict:
    async with connect_writable() as conn:
        token = await create_token(conn, tool_name=tool, payload=payload)
        async with conn.execute(
            "SELECT expires_at FROM tokens WHERE token=?", (token,)
        ) as cur:
            row = await cur.fetchone()
    return {
        "token": token,
        "expires_at": row[0],
        "message": "Awaiting human approval. Open BeatOS → Approvals.",
    }


async def update_list(list_id: int, name: str) -> dict:
    if not isinstance(name, str) or not name.strip():
        raise ValueError("name must be a non-empty string")
    if len(name) > _MAX_NAME:
        raise ValueError(f"name must be at most {_MAX_NAME} characters")
    async with connect_writable() as conn:
        row = await _fetch_list(conn, list_id)
        if row is None:
            raise ValueError(f"list_id {list_id} not found")
        cur_name, kind = row
        if kind == "system":
            raise ValueError("system lists cannot be renamed")
        # Collision check
        async with conn.execute(
            "SELECT 1 FROM list WHERE name=? AND id<>?", (name, list_id)
        ) as c2:
            collision = await c2.fetchone() is not None
    warnings = []
    if collision:
        warnings.append(f"a list named '{name}' already exists")
    payload = {
        "list_id": list_id,
        "name": name,
        "preview": build_preview(
            headline=f"Rename list '{cur_name}' → '{name}'",
            sample=[f"'{cur_name}' → '{name}'"],
            warnings=warnings,
        ),
    }
    return await _emit("update_list", payload)


async def delete_list(list_id: int) -> dict:
    async with connect_writable() as conn:
        row = await _fetch_list(conn, list_id)
        if row is None:
            raise ValueError(f"list_id {list_id} not found")
        name, kind = row
        if kind == "system":
            raise ValueError("system lists cannot be deleted")
        members = await _list_members(conn, list_id)
    payload = {
        "list_id": list_id,
        "name": name,
        "preview": build_preview(
            headline=f"PERMANENTLY delete list '{name}' ({len(members)} tracks unaffected)",
            sample=[f"list '{name}'"],
            warnings=[],
            risk="destructive",
        ),
    }
    return await _emit("delete_list", payload)


async def add_tracks_to_list(list_id: int, track_ids: list[int]) -> dict:
    validate_ids(track_ids, label="track_ids")
    async with connect_writable() as conn:
        if await _fetch_list(conn, list_id) is None:
            raise ValueError(f"list_id {list_id} not found")
        existing = await _list_members(conn, list_id)
        titles = await _track_titles(conn, track_ids)
    warnings: list[str] = []
    missing = [i for i in track_ids if i not in titles]
    if missing:
        warnings.append(f"{len(missing)} track ids not found, will be skipped")
    already = [i for i in track_ids if i in existing]
    if already:
        warnings.append(f"{len(already)} already in list, will be skipped")
    keep = [i for i in track_ids if i in titles and i not in existing]
    if not keep:
        raise ValueError(
            "No tracks to add: all provided track_ids are either already in the list or not found"
        )
    sample = format_track_sample([(i, titles[i]) for i in keep[:5]])
    payload = {
        "list_id": list_id,
        "track_ids": keep,
        "preview": build_preview(
            headline=f"Add {len(keep)} tracks to list",
            sample=sample,
            warnings=warnings,
        ),
    }
    return await _emit("add_tracks_to_list", payload)


async def remove_tracks_from_list(list_id: int, track_ids: list[int]) -> dict:
    validate_ids(track_ids, label="track_ids")
    async with connect_writable() as conn:
        if await _fetch_list(conn, list_id) is None:
            raise ValueError(f"list_id {list_id} not found")
        existing = await _list_members(conn, list_id)
        titles = await _track_titles(conn, track_ids)
    warnings: list[str] = []
    not_in_list = [i for i in track_ids if i not in existing]
    if not_in_list:
        warnings.append(f"{len(not_in_list)} not in list / not found, will be skipped")
    keep = [i for i in track_ids if i in existing]
    if not keep:
        raise ValueError(
            "No tracks to remove: none of the provided track_ids are members of this list"
        )
    sample = format_track_sample([(i, titles.get(i, "Untitled")) for i in keep[:5]])
    payload = {
        "list_id": list_id,
        "track_ids": keep,
        "preview": build_preview(
            headline=f"Remove {len(keep)} tracks from list",
            sample=sample,
            warnings=warnings,
        ),
    }
    return await _emit("remove_tracks_from_list", payload)


async def reorder_list(list_id: int, track_ids: list[int]) -> dict:
    validate_ids(track_ids, label="track_ids")
    async with connect_writable() as conn:
        if await _fetch_list(conn, list_id) is None:
            raise ValueError(f"list_id {list_id} not found")
        existing = await _list_members(conn, list_id)
        titles = await _track_titles(conn, track_ids)
    provided = set(track_ids)
    if len(provided) != len(track_ids):
        raise ValueError("track_ids must not contain duplicates")
    missing = existing - provided
    extra = provided - existing
    if missing:
        raise ValueError(f"missing ids in reorder payload: {sorted(missing)}")
    if extra:
        raise ValueError(f"extra ids not in list: {sorted(extra)}")
    sample = format_track_sample([(i, titles.get(i, "Untitled")) for i in track_ids[:5]])
    payload = {
        "list_id": list_id,
        "track_ids": list(track_ids),
        "preview": build_preview(
            headline=f"Reorder {len(track_ids)} tracks in list",
            sample=sample,
            warnings=[],
        ),
    }
    return await _emit("reorder_list", payload)
