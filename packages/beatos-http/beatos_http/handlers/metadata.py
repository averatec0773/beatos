"""Approve handlers for update_tracks + merge_metadata."""
from __future__ import annotations

import datetime as dt
import json
from typing import Any

import aiosqlite

from beatos_core.two_phase import (
    RowVanishedError,
    consume_token_with_result,
    verify_token,
)
from beatos_http.routes.tokens import register_approve_handler

_FIELD_TO_COL = {
    "title": "title",
    "bpm": "bpm",
    "key": "key_signature",  # tool-facing name → DB column
    "description": "description",
    "producer": "producer",
    "genre": "genre",
    "mood": "mood",
}
_SCALAR = {"title", "bpm", "key", "description"}
_MULTI = {"producer", "genre", "mood"}


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def _apply_array_patch(current_json: str | None, spec: Any) -> list[str]:
    """spec is either a list (replace) or {add?, remove?}."""
    if isinstance(spec, list):
        seen: set[str] = set()
        out: list[str] = []
        for v in spec:
            if v not in seen:
                out.append(v)
                seen.add(v)
        return out
    cur: list[str] = json.loads(current_json) if current_json else []
    add = list(spec.get("add", []) or [])
    remove = set(spec.get("remove", []) or [])
    out2: list[str] = []
    seen2: set[str] = set()
    for v in cur:
        if v in remove or v in seen2:
            continue
        out2.append(v)
        seen2.add(v)
    for v in add:
        if v not in seen2:
            out2.append(v)
            seen2.add(v)
    return out2


@register_approve_handler("update_tracks")
async def _approve_update_tracks(conn: aiosqlite.Connection, token: str) -> dict:
    payload = await verify_token(conn, token, expected_tool="update_tracks")
    ids = payload["ids"]
    patch = payload["patch"]
    now = _now()
    for tid in ids:
        sets: list[str] = []
        params: list[Any] = []
        for field, spec in patch.items():
            col = _FIELD_TO_COL[field]
            if field in _SCALAR:
                sets.append(f"{col}=?")
                params.append(spec)
            else:  # multi-value
                async with conn.execute(
                    f"SELECT {col} FROM track WHERE id=?", (tid,)
                ) as c0:
                    row = await c0.fetchone()
                if row is None:
                    raise RowVanishedError(f"track id={tid} no longer exists")
                new_arr = _apply_array_patch(row[0], spec)
                sets.append(f"{col}=?")
                params.append(json.dumps(new_arr))
        sets.append("updated_at=?")
        params.append(now)
        params.append(tid)
        cur = await conn.execute(
            f"UPDATE track SET {', '.join(sets)} WHERE id=?", params
        )
        if cur.rowcount != 1:
            raise RowVanishedError(f"track id={tid} no longer updatable")
    result = {"updated_count": len(ids), "ids": list(ids)}
    await consume_token_with_result(conn, token, result)
    return result


@register_approve_handler("merge_metadata")
async def _approve_merge_metadata(conn: aiosqlite.Connection, token: str) -> dict:
    payload = await verify_token(conn, token, expected_tool="merge_metadata")
    field = payload["field"]
    from_ = set(payload["from"])
    to = payload["to"]
    affected_ids = payload.get("_affected_ids") or []
    col = _FIELD_TO_COL[field]
    now = _now()
    changed = 0
    for tid in affected_ids:
        async with conn.execute(
            f"SELECT {col} FROM track WHERE id=?", (tid,)
        ) as c0:
            row = await c0.fetchone()
        if row is None:
            # Skip vanished rows silently for library-wide rename
            continue
        cur: list[str] = json.loads(row[0]) if row[0] else []
        out: list[str] = []
        seen: set[str] = set()
        for v in cur:
            replaced = to if v in from_ else v
            if replaced not in seen:
                out.append(replaced)
                seen.add(replaced)
        if out != cur:
            await conn.execute(
                f"UPDATE track SET {col}=?, updated_at=? WHERE id=?",
                (json.dumps(out), now, tid),
            )
            changed += 1
    result = {"affected_count": changed, "ids": list(affected_ids)}
    await consume_token_with_result(conn, token, result)
    return result
