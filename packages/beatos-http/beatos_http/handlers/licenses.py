"""Approve handler for set_license_tiers.

The token payload includes the full normalized tier list; we DELETE existing
tiers for the track and re-INSERT the new ones in one transaction, so the
track is never observed mid-replace.
"""
from __future__ import annotations

import datetime as dt
import json

import aiosqlite

from beatos_core.two_phase import (
    RowVanishedError,
    consume_token_with_result,
    verify_token,
)
from beatos_http.routes.tokens import register_approve_handler


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


@register_approve_handler("set_license_tiers")
async def _approve_set_license_tiers(
    conn: aiosqlite.Connection, token: str
) -> dict:
    payload = await verify_token(conn, token, expected_tool="set_license_tiers")
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
            " created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                track_id,
                position,
                tier["name"],
                json.dumps(tier.get("deliverables") or []),
                json.dumps(tier.get("prices") or {}),
                tier.get("notes"),
                now,
                now,
            ),
        )
    result = {"track_id": track_id, "tier_count": len(tiers)}
    await consume_token_with_result(conn, token, result)
    return result
