"""draft_descriptions — passthrough writer to track.description_draft (v0.0.24).

The signature is locked; v0.0.25 will replace the impl with real RAG
generation without changing what AI sees."""
from __future__ import annotations

from beatos_core.two_phase import create_token
from beatos_mcp.db import connect_writable
from beatos_mcp.preview import build_preview, format_track_sample

_MAX_ITEMS = 500
_MAX_TEXT = 5000
_ITEM_FIELDS = {"track_id", "text"}


async def draft_descriptions(items: list[dict]) -> dict:
    if not isinstance(items, list) or not items:
        raise ValueError("items must be a non-empty list")
    if len(items) > _MAX_ITEMS:
        raise ValueError(f"items too large: max {_MAX_ITEMS}")

    track_ids: list[int] = []
    for i, it in enumerate(items):
        if not isinstance(it, dict):
            raise ValueError(f"items[{i}] must be a dict")
        unknown = set(it) - _ITEM_FIELDS
        if unknown:
            raise ValueError(f"items[{i}]: unknown fields {sorted(unknown)}")
        tid = it.get("track_id")
        text = it.get("text")
        if isinstance(tid, bool) or not isinstance(tid, int):
            raise ValueError(f"items[{i}].track_id must be an int")
        if not isinstance(text, str):
            raise ValueError(f"items[{i}].text must be a string")
        if len(text) > _MAX_TEXT:
            raise ValueError(f"items[{i}].text too long (max {_MAX_TEXT} chars)")
        track_ids.append(tid)

    if len(set(track_ids)) != len(track_ids):
        raise ValueError("items must not contain duplicate track_ids")

    async with connect_writable() as conn:
        ph = ",".join("?" * len(track_ids))
        async with conn.execute(
            f"SELECT id, title FROM track WHERE id IN ({ph})", track_ids
        ) as cur:
            rows = await cur.fetchall()

    titles = {r[0]: r[1] for r in rows}
    warnings: list[str] = []
    missing = [tid for tid in track_ids if tid not in titles]
    if missing:
        warnings.append(f"{len(missing)} track ids not found, will be skipped")
    keep = [it for it in items if it["track_id"] in titles]
    if not keep:
        raise ValueError("all provided track_ids were not found")

    sample_rows = [(it["track_id"], titles[it["track_id"]]) for it in keep[:5]]
    payload = {
        "items": keep,
        "preview": build_preview(
            headline=f"Set description draft on {len(keep)} tracks",
            sample=format_track_sample(sample_rows),
            warnings=warnings,
        ),
    }
    async with connect_writable() as conn:
        token = await create_token(conn, "draft_descriptions", payload)
        async with conn.execute(
            "SELECT expires_at FROM tokens WHERE token=?", (token,)
        ) as cur:
            row = await cur.fetchone()
    return {
        "token": token,
        "expires_at": row[0],
        "message": "Awaiting human approval. Open BeatOS → Approvals.",
    }
