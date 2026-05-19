"""Metadata tools: update_tracks (per-id patch) + merge_metadata (library-wide rename).

`update_tracks` patch fields:
  - title (str | None), bpm (int | None), key (str | None), description (str | None)
  - producer / genre / mood: list[str] (replace) OR {"add": [str,...], "remove": [str,...]} (delta)
Tool-level field name `key` maps to DB column `key_signature` (mapping happens
in the http handler — payload stores the tool-facing name `key`)."""
from __future__ import annotations

from typing import Any

import aiosqlite

from beatos_core.two_phase import create_token
from beatos_mcp.db import connect_writable
from beatos_mcp.preview import build_preview, format_track_sample
from beatos_mcp.validate import validate_ids

_SCALAR_FIELDS = {"title", "bpm", "key", "description"}
_MULTI_FIELDS = {"producer", "genre", "mood"}
_ALLOWED_FIELDS = _SCALAR_FIELDS | _MULTI_FIELDS
_MAX_FROM = 20


def _validate_patch(patch: dict[str, Any]) -> None:
    if not isinstance(patch, dict) or not patch:
        raise ValueError("patch must be a non-empty dict")
    unknown = set(patch) - _ALLOWED_FIELDS
    if unknown:
        raise ValueError(f"unknown patch fields: {sorted(unknown)}")
    for field in _MULTI_FIELDS:
        if field in patch:
            v = patch[field]
            if isinstance(v, list):
                if not all(isinstance(x, str) for x in v):
                    raise ValueError(f"{field} list must contain only strings")
            elif isinstance(v, dict):
                extra = set(v) - {"add", "remove"}
                if extra:
                    raise ValueError(f"{field} delta has unknown keys: {sorted(extra)}")
                for k in ("add", "remove"):
                    if k in v and not (
                        isinstance(v[k], list) and all(isinstance(x, str) for x in v[k])
                    ):
                        raise ValueError(f"{field}.{k} must be a list of strings")
            else:
                raise ValueError(
                    f"{field} must be either a list of strings or a delta dict"
                )


def _patch_headline(patch: dict[str, Any], n: int) -> str:
    parts = []
    for field, v in patch.items():
        if isinstance(v, dict):
            adds = v.get("add") or []
            removes = v.get("remove") or []
            chunks = []
            if adds:
                chunks.append(f"add {field}={adds}")
            if removes:
                chunks.append(f"remove {field}={removes}")
            parts.append(", ".join(chunks))
        elif isinstance(v, list):
            parts.append(f"set {field}={v}")
        else:
            parts.append(f"set {field}={v!r}")
    body = "; ".join(parts)
    return f"Update {n} tracks: {body}"


async def update_tracks(ids: list[int], patch: dict[str, Any]) -> dict:
    validate_ids(ids)
    _validate_patch(patch)

    async with connect_writable() as conn:
        ph = ",".join("?" * len(ids))
        async with conn.execute(
            f"SELECT id, title FROM track WHERE id IN ({ph})", ids
        ) as cur:
            rows = await cur.fetchall()
    info = {r[0]: r[1] for r in rows}
    warnings: list[str] = []
    missing = [i for i in ids if i not in info]
    if missing:
        warnings.append(f"{len(missing)} of {len(ids)} ids not found, will be skipped")
    keep = [i for i in ids if i in info]
    if not keep:
        raise ValueError("all provided ids were not found")
    sample = format_track_sample([(i, info[i]) for i in keep[:5]])
    payload = {
        "ids": keep,
        "patch": patch,
        "preview": build_preview(
            headline=_patch_headline(patch, len(keep)),
            sample=sample,
            warnings=warnings,
        ),
    }
    async with connect_writable() as conn:
        token = await create_token(conn, "update_tracks", payload)
        async with conn.execute(
            "SELECT expires_at FROM tokens WHERE token=?", (token,)
        ) as cur:
            row = await cur.fetchone()
    return {
        "token": token,
        "expires_at": row[0],
        "message": "Awaiting human approval. Open BeatOS → Approvals.",
    }


async def merge_metadata(field: str, from_: list[str], to: str) -> dict:
    if field not in _MULTI_FIELDS:
        raise ValueError(f"field must be one of {sorted(_MULTI_FIELDS)}")
    if not isinstance(from_, list) or not from_:
        raise ValueError("from_ must be a non-empty list of strings")
    if len(from_) > _MAX_FROM:
        raise ValueError(f"from_ list too large: max {_MAX_FROM}")
    if not all(isinstance(x, str) and x for x in from_):
        raise ValueError("from_ must contain non-empty strings")
    if not isinstance(to, str) or not to.strip():
        raise ValueError("to must be a non-empty string")
    if len(to) > 200:
        raise ValueError("to must be at most 200 characters")

    # Scan for affected tracks via JSON1
    ph = ",".join("?" * len(from_))
    query = (
        f"SELECT id, title FROM track WHERE EXISTS "
        f"(SELECT 1 FROM json_each(track.{field}) WHERE value IN ({ph}))"
        " ORDER BY id"
    )
    async with connect_writable() as conn:
        async with conn.execute(query, from_) as cur:
            rows = await cur.fetchall()
    if not rows:
        raise ValueError(f"no tracks match the from_ aliases for {field}")
    affected_ids = [r[0] for r in rows]
    sample = format_track_sample(list(rows[:5]))
    payload = {
        "field": field,
        "from": list(from_),
        "to": to,
        "preview": build_preview(
            headline=(
                f"Merge {len(from_)} {field} aliases into '{to}' "
                f"across {len(affected_ids)} tracks"
            ),
            sample=sample,
            warnings=[],
        ),
        # Cache affected ids so handler does not need to scan again.
        "_affected_ids": affected_ids,
    }
    async with connect_writable() as conn:
        token = await create_token(conn, "merge_metadata", payload)
        async with conn.execute(
            "SELECT expires_at FROM tokens WHERE token=?", (token,)
        ) as cur:
            row = await cur.fetchone()
    return {
        "token": token,
        "expires_at": row[0],
        "message": "Awaiting human approval. Open BeatOS → Approvals.",
    }
