"""Ingest tools: create_tracks (batch) + attach_asset (single)."""
from __future__ import annotations

import os
from typing import Any

from beatos_core.two_phase import create_token
from beatos_mcp.db import connect_writable
from beatos_mcp.preview import build_preview

_MAX_ITEMS = 100
_ITEM_FIELDS = {"title", "bpm", "key", "producer", "genre", "mood"}
_AUDIO_EXT = {".mp3", ".wav", ".flac", ".aif", ".aiff"}
_COVER_EXT = {".jpg", ".jpeg", ".png", ".webp"}


def _validate_create_items(items: list[dict[str, Any]]) -> None:
    if not isinstance(items, list) or not items:
        raise ValueError("items must be a non-empty list")
    if len(items) > _MAX_ITEMS:
        raise ValueError(f"items list too large: max {_MAX_ITEMS}")
    for i, it in enumerate(items):
        if not isinstance(it, dict):
            raise ValueError(f"items[{i}] must be a dict")
        unknown = set(it) - _ITEM_FIELDS
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
        if bpm is not None and not isinstance(bpm, int):
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


async def attach_asset(track_id: int, role: str, path: str) -> dict:
    if role not in ("audio", "cover"):
        raise ValueError("role must be 'audio' or 'cover'")
    if not isinstance(path, str) or not path:
        raise ValueError("path must be a non-empty string")
    if not os.path.isabs(path):
        raise ValueError("path must be absolute")
    if not os.path.isfile(path):
        raise ValueError(f"file not found: {path}")
    ext = os.path.splitext(path)[1].lower()
    allowed = _AUDIO_EXT if role == "audio" else _COVER_EXT
    if ext not in allowed:
        raise ValueError(
            f"file extension {ext!r} does not match role={role!r} "
            f"(allowed: {sorted(allowed)})"
        )

    async with connect_writable() as conn:
        async with conn.execute(
            "SELECT title FROM track WHERE id=?", (track_id,)
        ) as cur:
            track_row = await cur.fetchone()
        if track_row is None:
            raise ValueError(f"track_id {track_id} not found")
        title = track_row[0]
        async with conn.execute(
            "SELECT 1 FROM asset WHERE track_id=? AND role=?", (track_id, role)
        ) as cur:
            replacing = (await cur.fetchone()) is not None

    warnings = []
    if replacing:
        warnings.append(f"asset already attached for role={role!r}; will be replaced")

    payload = {
        "track_id": track_id,
        "role": role,
        "path": path,
        "preview": build_preview(
            headline=f"Attach {role} to '#{track_id} {title or 'Untitled'}'",
            sample=[os.path.basename(path)],
            warnings=warnings,
        ),
    }
    async with connect_writable() as conn:
        token = await create_token(conn, "attach_asset", payload)
        async with conn.execute(
            "SELECT expires_at FROM tokens WHERE token=?", (token,)
        ) as cur:
            row = await cur.fetchone()
    return {
        "token": token,
        "expires_at": row[0],
        "message": "Awaiting human approval. Open BeatOS → Approvals.",
    }
