"""Approve handler for draft_descriptions."""
from __future__ import annotations

import datetime as dt

import aiosqlite

from beatos_core.two_phase import (
    RowVanishedError,
    consume_token_with_result,
    verify_token,
)
from beatos_http.routes.tokens import register_approve_handler


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


@register_approve_handler("draft_descriptions")
async def _approve_draft_descriptions(
    conn: aiosqlite.Connection, token: str
) -> dict:
    payload = await verify_token(conn, token, expected_tool="draft_descriptions")
    items = payload["items"]
    now = _now()
    set_ids: list[int] = []
    for it in items:
        tid = it["track_id"]
        text = it["text"]
        cur = await conn.execute(
            "UPDATE track SET description_draft=?, updated_at=? WHERE id=?",
            (text, now, tid),
        )
        if cur.rowcount != 1:
            raise RowVanishedError(f"track id={tid} no longer exists")
        set_ids.append(tid)
    result = {"set_count": len(set_ids), "ids": set_ids}
    await consume_token_with_result(conn, token, result)
    return result
