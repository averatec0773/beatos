"""Direct-apply handlers for update_tracks + merge_metadata."""
from __future__ import annotations

import datetime as dt
import json
from typing import Any

import aiosqlite

from beatos_core.approvals import (
    RowVanishedError,
    register_apply_handler as register_approve_handler,
)
from beatos_core.tracks.patch import (
    apply_array_patch as _apply_array_patch,
    FIELD_TO_COL as _FIELD_TO_COL,
    SCALAR_FIELDS as _SCALAR,
)


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


@register_approve_handler("update_tracks")
async def _approve_update_tracks(conn: aiosqlite.Connection, payload: dict) -> dict:
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
    return {"updated_count": len(ids), "ids": list(ids)}


@register_approve_handler("merge_metadata")
async def _approve_merge_metadata(conn: aiosqlite.Connection, payload: dict) -> dict:
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
    return {"affected_count": changed, "ids": list(affected_ids)}
