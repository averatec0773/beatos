"""Ingest tools: create_tracks + attach_assets (batch) + detach_assets (batch).

v0.0.24.2: replaced singular attach_asset with batch tools. The bottleneck for
folder-import workflows was one 2PC approval per (track, role) attachment;
batching collapses N approvals into 1.
"""
from __future__ import annotations

import os
from typing import Any

from beatos_core.two_phase import create_token
from beatos_mcp.db import connect_writable
from beatos_mcp.preview import build_preview

_MAX_CREATE_ITEMS = 100
_MAX_ASSET_ITEMS = 500
_CREATE_ITEM_FIELDS = {"title", "bpm", "key", "producer", "genre", "mood"}
_ATTACH_ITEM_FIELDS = {"track_id", "role", "path"}
_DETACH_ITEM_FIELDS = {"track_id", "role"}
_VALID_ROLES = ("audio", "cover")
_AUDIO_EXT = {".mp3", ".wav", ".flac", ".aif", ".aiff"}
_COVER_EXT = {".jpg", ".jpeg", ".png", ".webp"}


def _validate_create_items(items: list[dict[str, Any]]) -> None:
    if not isinstance(items, list) or not items:
        raise ValueError("items must be a non-empty list")
    if len(items) > _MAX_CREATE_ITEMS:
        raise ValueError(f"items list too large: max {_MAX_CREATE_ITEMS}")
    for i, it in enumerate(items):
        if not isinstance(it, dict):
            raise ValueError(f"items[{i}] must be a dict")
        unknown = set(it) - _CREATE_ITEM_FIELDS
        if unknown:
            raise ValueError(f"items[{i}]: unknown fields {sorted(unknown)}")
        title = it.get("title")
        if not isinstance(title, str) or not title.strip():
            raise ValueError(f"items[{i}].title must be a non-empty string")
        if len(title) > 200:
            raise ValueError(f"items[{i}].title must be at most 200 characters")
        for field in ("producer", "genre", "mood"):
            v = it.get(field)
            if v is not None:
                if not isinstance(v, list):
                    raise ValueError(f"items[{i}].{field} must be a list of strings")
                for j, x in enumerate(v):
                    if not isinstance(x, str) or not x:
                        raise ValueError(
                            f"items[{i}].{field}[{j}] must be a non-empty string"
                        )
        bpm = it.get("bpm")
        if bpm is not None and (isinstance(bpm, bool) or not isinstance(bpm, int)):
            raise ValueError(f"items[{i}].bpm must be int or omitted")


async def create_tracks(items: list[dict[str, Any]]) -> dict:
    _validate_create_items(items)
    sample = [f"#{i + 1} {it['title']}" for i, it in enumerate(items[:5])]
    payload = {
        "items": items,
        "preview": build_preview(
            headline=f"Create {len(items)} track{'s' if len(items) != 1 else ''}",
            sample=sample,
            warnings=[],
        ),
    }
    async with connect_writable() as conn:
        token = await create_token(conn, "create_tracks", payload)
        async with conn.execute(
            "SELECT expires_at FROM tokens WHERE token=?", (token,)
        ) as cur:
            row = await cur.fetchone()
    return {
        "token": token,
        "expires_at": row[0],
        "message": "Awaiting human approval. Open BeatOS → Approvals.",
    }


def _validate_role(value: Any, *, where: str) -> str:
    if value not in _VALID_ROLES:
        raise ValueError(f"{where}.role must be one of {list(_VALID_ROLES)}")
    return value


def _validate_track_id(value: Any, *, where: str) -> int:
    # bool is an int subclass — reject explicitly.
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(f"{where}.track_id must be a positive integer")
    return value


def _validate_attach_items(items: list[dict[str, Any]]) -> None:
    if not isinstance(items, list) or not items:
        raise ValueError("items must be a non-empty list")
    if len(items) > _MAX_ASSET_ITEMS:
        raise ValueError(f"items list too large: max {_MAX_ASSET_ITEMS}")
    seen: set[tuple[int, str]] = set()
    for i, it in enumerate(items):
        if not isinstance(it, dict):
            raise ValueError(f"items[{i}] must be a dict")
        missing = _ATTACH_ITEM_FIELDS - set(it)
        if missing:
            raise ValueError(f"items[{i}]: missing fields {sorted(missing)}")
        unknown = set(it) - _ATTACH_ITEM_FIELDS
        if unknown:
            raise ValueError(f"items[{i}]: unknown fields {sorted(unknown)}")
        track_id = _validate_track_id(it["track_id"], where=f"items[{i}]")
        role = _validate_role(it["role"], where=f"items[{i}]")
        path = it["path"]
        if not isinstance(path, str) or not path:
            raise ValueError(f"items[{i}].path must be a non-empty string")
        if not os.path.isabs(path):
            raise ValueError(f"items[{i}].path must be absolute")
        if not os.path.isfile(path):
            raise ValueError(f"items[{i}]: file not found: {path}")
        ext = os.path.splitext(path)[1].lower()
        allowed = _AUDIO_EXT if role == "audio" else _COVER_EXT
        if ext not in allowed:
            raise ValueError(
                f"items[{i}]: extension {ext!r} does not match role={role!r} "
                f"(allowed: {sorted(allowed)})"
            )
        key = (track_id, role)
        if key in seen:
            raise ValueError(
                f"items[{i}]: duplicate (track_id={track_id}, role={role!r}) in batch"
            )
        seen.add(key)


def _validate_detach_items(items: list[dict[str, Any]]) -> None:
    if not isinstance(items, list) or not items:
        raise ValueError("items must be a non-empty list")
    if len(items) > _MAX_ASSET_ITEMS:
        raise ValueError(f"items list too large: max {_MAX_ASSET_ITEMS}")
    seen: set[tuple[int, str]] = set()
    for i, it in enumerate(items):
        if not isinstance(it, dict):
            raise ValueError(f"items[{i}] must be a dict")
        missing = _DETACH_ITEM_FIELDS - set(it)
        if missing:
            raise ValueError(f"items[{i}]: missing fields {sorted(missing)}")
        unknown = set(it) - _DETACH_ITEM_FIELDS
        if unknown:
            raise ValueError(f"items[{i}]: unknown fields {sorted(unknown)}")
        track_id = _validate_track_id(it["track_id"], where=f"items[{i}]")
        role = _validate_role(it["role"], where=f"items[{i}]")
        key = (track_id, role)
        if key in seen:
            raise ValueError(
                f"items[{i}]: duplicate (track_id={track_id}, role={role!r}) in batch"
            )
        seen.add(key)


async def attach_assets(items: list[dict[str, Any]]) -> dict:
    _validate_attach_items(items)

    # Pre-flight DB: all tracks must exist; classify each as new vs replacement.
    track_ids = sorted({int(it["track_id"]) for it in items})
    placeholders = ",".join("?" * len(track_ids))
    async with connect_writable() as conn:
        async with conn.execute(
            f"SELECT id FROM track WHERE id IN ({placeholders})", track_ids
        ) as cur:
            existing_tracks = {r[0] for r in await cur.fetchall()}
        missing_tracks = sorted(set(track_ids) - existing_tracks)
        if missing_tracks:
            raise ValueError(f"track ids not found: {missing_tracks}")
        # Detect replacements (existing role-slots) in one query.
        replacements: set[tuple[int, str]] = set()
        async with conn.execute(
            f"SELECT track_id, role FROM asset WHERE track_id IN ({placeholders})",
            track_ids,
        ) as cur:
            existing_assets = {(r[0], r[1]) for r in await cur.fetchall()}
        for it in items:
            key = (int(it["track_id"]), it["role"])
            if key in existing_assets:
                replacements.add(key)

    n = len(items)
    n_new = n - len(replacements)
    headline = (
        f"Attach {n} asset{'s' if n != 1 else ''} "
        f"({n_new} new, {len(replacements)} replacing)"
    )
    sample = [
        f"#{it['track_id']} {it['role']}: {os.path.basename(it['path'])}"
        for it in items[:5]
    ]
    warnings: list[str] = []
    if replacements:
        sample_replacements = sorted(replacements)[:3]
        warnings.append(
            f"{len(replacements)} existing asset(s) will be replaced: "
            + ", ".join(f"#{tid}/{role}" for tid, role in sample_replacements)
            + ("..." if len(replacements) > 3 else "")
        )

    payload = {
        "items": items,
        "preview": build_preview(headline=headline, sample=sample, warnings=warnings),
    }
    async with connect_writable() as conn:
        token = await create_token(conn, "attach_assets", payload)
        async with conn.execute(
            "SELECT expires_at FROM tokens WHERE token=?", (token,)
        ) as cur:
            row = await cur.fetchone()
    return {
        "token": token,
        "expires_at": row[0],
        "message": "Awaiting human approval. Open BeatOS → Approvals.",
    }


async def detach_assets(items: list[dict[str, Any]]) -> dict:
    _validate_detach_items(items)

    # Pre-flight: classify present-vs-absent so the preview reports accurately.
    track_ids = sorted({int(it["track_id"]) for it in items})
    placeholders = ",".join("?" * len(track_ids))
    async with connect_writable() as conn:
        async with conn.execute(
            f"SELECT track_id, role FROM asset WHERE track_id IN ({placeholders})",
            track_ids,
        ) as cur:
            existing_assets = {(r[0], r[1]) for r in await cur.fetchall()}

    present_count = sum(
        1 for it in items if (int(it["track_id"]), it["role"]) in existing_assets
    )
    absent_count = len(items) - present_count

    headline = (
        f"Detach {present_count} asset{'s' if present_count != 1 else ''}"
        + (f" ({absent_count} already absent, no-op)" if absent_count else "")
    )
    sample = [
        f"#{it['track_id']} {it['role']}"
        for it in items
        if (int(it["track_id"]), it["role"]) in existing_assets
    ][:5]
    if not sample and items:
        # All items refer to assets that don't exist; show first few anyway so
        # the user understands what was requested.
        sample = [f"#{it['track_id']} {it['role']}" for it in items[:5]]

    payload = {
        "items": items,
        "preview": build_preview(headline=headline, sample=sample, warnings=[]),
    }
    async with connect_writable() as conn:
        token = await create_token(conn, "detach_assets", payload)
        async with conn.execute(
            "SELECT expires_at FROM tokens WHERE token=?", (token,)
        ) as cur:
            row = await cur.fetchone()
    return {
        "token": token,
        "expires_at": row[0],
        "message": "Awaiting human approval. Open BeatOS → Approvals.",
    }
