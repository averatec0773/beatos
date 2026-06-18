"""Direct-apply handler for set_license_tiers.

The payload includes the full normalized tier list; we DELETE existing tiers for
the track and re-INSERT the new ones in one transaction, so the track is never
observed mid-replace.
"""
from __future__ import annotations

import datetime as dt
import json

import aiosqlite

from beatos_core.approvals import (
    RowVanishedError,
    register_apply_handler as register_approve_handler,
)


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


@register_approve_handler("set_license_tiers")
async def _approve_set_license_tiers(
    conn: aiosqlite.Connection, payload: dict
) -> dict:
    track_id = payload["track_id"]
    tiers = payload["tiers"]

    async with conn.execute(
        "SELECT id FROM track WHERE id = ?", (track_id,)
    ) as cur:
        row = await cur.fetchone()
    if row is None:
        raise RowVanishedError(f"track id={track_id} no longer exists")

    now = _now()
    await conn.execute(
        "DELETE FROM license_tier WHERE track_id = ?", (track_id,)
    )
    for position, tier in enumerate(tiers):
        await conn.execute(
            "INSERT INTO license_tier "
            "(track_id, position, name, deliverables, prices_json, notes, "
            " share, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                track_id,
                position,
                tier["name"],
                json.dumps(tier.get("deliverables") or []),
                json.dumps(tier.get("prices") or {}),
                tier.get("notes"),
                tier.get("share"),
                now,
                now,
            ),
        )
    return {"track_id": track_id, "tier_count": len(tiers)}
