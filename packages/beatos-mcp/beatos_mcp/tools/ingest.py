"""Ingest tools: create_tracks + attach_assets (batch) + detach_assets (batch).

v0.0.24.2: replaced singular attach_asset with batch tools. The bottleneck for
folder-import workflows was one call per (track, role) attachment; batching
collapses N calls into 1.
"""
from __future__ import annotations

import os
from typing import Any

from beatos_core.assets import AUDIO_ROLES, EXT_TO_FORMAT
from beatos_mcp.db import connect_writable
from beatos_mcp.policy import submit_write
from beatos_mcp.preview import build_preview

_MAX_CREATE_ITEMS = 100
_MAX_ASSET_ITEMS = 500
_CREATE_ITEM_FIELDS = {"title", "bpm", "key", "producer", "genre", "mood"}
_ATTACH_ITEM_FIELDS = {"track_id", "role", "path"}
_DETACH_ITEM_FIELDS = {"track_id", "role"}
# The agent-facing role vocabulary is deliberately simple ("audio"/"cover"/
# "stems"); the DB stores semantic roles + a separate `format`. On attach,
# "audio" resolves to the untagged master role and the extension picks the
# format. Supported audio formats live in beatos_core EXT_TO_FORMAT — adding one
# there (e.g. .aiff) is all it takes.
#
# "stems" maps to the canonical `stems` role with format '' (one stems slot per
# track, replace-in-place). Stems is a deliverable bundle — typically a .zip,
# but a single multitrack audio file is also accepted. Format is NOT recorded
# for stems (it stays '' like cover), so a track holds exactly one stems asset
# regardless of container.
_VALID_ROLES = ("audio", "cover", "stems")
_AUDIO_EXT = set(EXT_TO_FORMAT)
_COVER_EXT = {".jpg", ".jpeg", ".png", ".webp"}
# Stems are usually shipped as an archive; allow common archive containers plus
# the supported audio extensions (a producer may ship a single multitrack file).
_STEMS_EXT = {".zip", ".rar", ".7z"} | _AUDIO_EXT


def _resolve_attach_role(role: str, ext: str) -> tuple[str, str]:
    """Map the agent-facing role to a (canonical_role, format) pair. 'cover' and
    'stems' carry no format ('' → one slot per track); 'audio' resolves to the
    untagged master role + the file's format."""
    if role == "cover":
        return "cover", ""
    if role == "stems":
        return "stems", ""
    return "audio_untagged", EXT_TO_FORMAT[ext]


def _detach_present(track_id: int, role: str, existing: set[tuple[int, str]]) -> bool:
    """Detach has no file extension to resolve, so the agent-facing 'audio' role
    matches ANY canonical audio role the track holds; 'cover'/'stems' match
    exactly (their canonical role name equals the agent-facing name)."""
    if role == "audio":
        return any((track_id, r) in existing for r in AUDIO_ROLES)
    return (track_id, role) in existing


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
    return await submit_write("create_tracks", payload)


def _validate_role(value: Any, *, where: str) -> str:
    if value not in _VALID_ROLES:
        raise ValueError(f"{where}.role must be one of {list(_VALID_ROLES)}")
    return value


def _validate_track_id(value: Any, *, where: str) -> int:
    # bool is an int subclass — reject explicitly.
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(f"{where}.track_id must be a positive integer")
    return value


def _validate_attach_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Validate the batch and return a normalized copy with the agent-facing role
    resolved to a (canonical role, format) pair. Dedup is on (role, format), so the
    same track may receive an audio WAV and an audio MP3 in one batch."""
    if not isinstance(items, list) or not items:
        raise ValueError("items must be a non-empty list")
    if len(items) > _MAX_ASSET_ITEMS:
        raise ValueError(f"items list too large: max {_MAX_ASSET_ITEMS}")
    seen: set[tuple[int, str, str]] = set()
    normalized: list[dict[str, Any]] = []
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
        allowed = {"audio": _AUDIO_EXT, "cover": _COVER_EXT, "stems": _STEMS_EXT}[role]
        if ext not in allowed:
            raise ValueError(
                f"items[{i}]: extension {ext!r} does not match role={role!r} "
                f"(allowed: {sorted(allowed)})"
            )
        canonical_role, fmt = _resolve_attach_role(role, ext)
        key = (track_id, canonical_role, fmt)
        if key in seen:
            label = f"{canonical_role}/{fmt}" if fmt else canonical_role
            raise ValueError(
                f"items[{i}]: duplicate (track_id={track_id}, role={label!r}) in batch"
            )
        seen.add(key)
        normalized.append(
            {"track_id": track_id, "role": canonical_role, "format": fmt, "path": path}
        )
    return normalized


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
    items = _validate_attach_items(items)

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
        # Detect replacements (existing role+format slots) in one query.
        replacements: set[tuple[int, str, str]] = set()
        async with conn.execute(
            f"SELECT track_id, role, format FROM asset WHERE track_id IN ({placeholders})",
            track_ids,
        ) as cur:
            existing_assets = {(r[0], r[1], r[2] or "") for r in await cur.fetchall()}
        for it in items:
            key = (int(it["track_id"]), it["role"], it["format"])
            if key in existing_assets:
                replacements.add(key)

    n = len(items)
    n_new = n - len(replacements)
    headline = (
        f"Attach {n} asset{'s' if n != 1 else ''} "
        f"({n_new} new, {len(replacements)} replacing)"
    )

    def _slot(role: str, fmt: str) -> str:
        return f"{role}/{fmt}" if fmt else role

    sample = [
        f"#{it['track_id']} {_slot(it['role'], it['format'])}: {os.path.basename(it['path'])}"
        for it in items[:5]
    ]
    warnings: list[str] = []
    if replacements:
        sample_replacements = sorted(replacements)[:3]
        warnings.append(
            f"{len(replacements)} existing asset(s) will be replaced: "
            + ", ".join(f"#{tid}/{_slot(role, fmt)}" for tid, role, fmt in sample_replacements)
            + ("..." if len(replacements) > 3 else "")
        )

    payload = {
        "items": items,
        "preview": build_preview(headline=headline, sample=sample, warnings=warnings),
    }
    return await submit_write("attach_assets", payload)


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
        1 for it in items if _detach_present(int(it["track_id"]), it["role"], existing_assets)
    )
    absent_count = len(items) - present_count

    headline = (
        f"Detach {present_count} asset{'s' if present_count != 1 else ''}"
        + (f" ({absent_count} already absent, no-op)" if absent_count else "")
    )
    sample = [
        f"#{it['track_id']} {it['role']}"
        for it in items
        if _detach_present(int(it["track_id"]), it["role"], existing_assets)
    ][:5]
    if not sample and items:
        # All items refer to assets that don't exist; show first few anyway so
        # the user understands what was requested.
        sample = [f"#{it['track_id']} {it['role']}" for it in items[:5]]

    payload = {
        "items": items,
        "preview": build_preview(headline=headline, sample=sample, warnings=[]),
    }
    return await submit_write("detach_assets", payload)
