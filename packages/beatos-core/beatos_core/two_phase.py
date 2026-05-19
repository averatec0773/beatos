"""Two-phase commit token store (skeleton for v0.0.21+ write tools).

The first phase of a write tool builds a prepared payload and stashes it
under a fresh token; the user-driven confirm tool verifies and consumes
the token in the same DB transaction as the actual write.

v0.0.20 ships this module without exposing any write tool — it exists so
v0.0.21's first write tool is a small plug-in, not a re-architecture.
"""
from __future__ import annotations

import json
import secrets
import time

import aiosqlite

DEFAULT_TTL_SEC = 300


class TokenError(RuntimeError):
    """Raised on every 2PC failure mode (not found, tool mismatch, expired, consumed)."""


async def create_token(
    conn: aiosqlite.Connection,
    tool_name: str,
    payload: dict,
    ttl_sec: int = DEFAULT_TTL_SEC,
) -> str:
    """Persist a pending token and return its opaque string."""
    token = secrets.token_urlsafe(16)
    now = time.time()
    await conn.execute(
        "INSERT INTO tokens "
        "(token, tool_name, payload, created_at, expires_at, status) "
        "VALUES (?, ?, ?, ?, ?, 'pending')",
        (token, tool_name, json.dumps(payload), now, now + ttl_sec),
    )
    await conn.commit()
    return token


async def verify_token(
    conn: aiosqlite.Connection,
    token: str,
    expected_tool: str,
) -> dict:
    """Look up the token, enforce status + tool + expiry. Return payload dict.

    Raises TokenError on any failure. On expiry, the row is marked 'expired'
    as a side effect (so the next attempt fails fast).
    """
    async with conn.execute(
        "SELECT tool_name, payload, expires_at, status FROM tokens WHERE token=?",
        (token,),
    ) as cur:
        row = await cur.fetchone()
    if row is None:
        raise TokenError(f"token not found: {token}")

    tool_name, payload_json, expires_at, status = row

    if status == "consumed":
        raise TokenError(f"token already consumed: {token}")
    if status == "expired":
        raise TokenError(f"token expired: {token}")

    if tool_name != expected_tool:
        raise TokenError(
            f"token tool mismatch: created for {tool_name!r}, used on {expected_tool!r}"
        )

    if time.time() >= expires_at:
        await conn.execute(
            "UPDATE tokens SET status='expired' WHERE token=? AND status='pending'",
            (token,),
        )
        await conn.commit()
        raise TokenError(f"token expired: {token}")

    return json.loads(payload_json)


async def consume_token(conn: aiosqlite.Connection, token: str) -> None:
    """Mark a verified token consumed. Caller MUST be inside the same
    DB transaction as the actual write so the two commit atomically."""
    now = time.time()
    cur = await conn.execute(
        "UPDATE tokens SET status='consumed', consumed_at=? "
        "WHERE token=? AND status='pending'",
        (now, token),
    )
    if cur.rowcount != 1:
        raise TokenError(f"token not in pending state: {token}")
