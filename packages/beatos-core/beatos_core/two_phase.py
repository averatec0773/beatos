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

DEFAULT_TTL_SEC = 600  # was 300


class TokenError(RuntimeError):
    """Raised on every 2PC failure mode (not found, tool mismatch, expired, consumed)."""


class RowVanishedError(RuntimeError):
    """Raised by a batch handler when an UPDATE/DELETE returns 0 rows because
    the target id was deleted between token-create and approve. The dispatch
    in routes/tokens.py treats this as a 409 and rolls the transaction back."""


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
        # Note: cleanup_terminal_tokens owns the pending → expired UPDATE.
        # verify_token is now strictly read-only so callers can use it
        # inside their own transactions without risk of premature commit.
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


async def consume_token_with_result(
    conn: aiosqlite.Connection,
    token: str,
    result: dict,
) -> None:
    """Like consume_token, but also stores the write outcome (e.g. {"list_id": 7})
    in the result column. Caller MUST be inside the same transaction as the
    actual write so the two commit atomically."""
    now = time.time()
    cur = await conn.execute(
        "UPDATE tokens SET status='consumed', consumed_at=?, result=? "
        "WHERE token=? AND status='pending'",
        (now, json.dumps(result), token),
    )
    if cur.rowcount != 1:
        raise TokenError(f"token not in pending state: {token}")


async def reject_token(conn: aiosqlite.Connection, token: str) -> None:
    """User-initiated rejection. Marks pending token as rejected.
    No-op on already-terminal tokens — handles Approve/Reject race
    gracefully (one side wins, other is silent)."""
    now = time.time()
    await conn.execute(
        "UPDATE tokens SET status='rejected', consumed_at=? "
        "WHERE token=? AND status='pending'",
        (now, token),
    )
    await conn.commit()


async def get_token_status(conn: aiosqlite.Connection, token: str) -> dict:
    """Read-only. Returns token metadata. Used by confirm_* tools to
    report status back to AI."""
    async with conn.execute(
        "SELECT tool_name, status, payload, result, expires_at FROM tokens WHERE token=?",
        (token,),
    ) as cur:
        row = await cur.fetchone()
    if row is None:
        raise TokenError(f"token not found: {token}")
    tool_name, status, payload_json, result_json, expires_at = row
    return {
        "tool_name": tool_name,
        "status": status,
        "payload": json.loads(payload_json),
        "result": json.loads(result_json) if result_json else None,
        "expires_at": expires_at,
    }


async def cleanup_terminal_tokens(
    conn: aiosqlite.Connection,
    max_age_days: int = 7,
) -> int:
    """Transition pending → expired for tokens past TTL, then delete tokens
    in terminal state older than max_age_days. Returns total rows deleted.

    Uses COALESCE(consumed_at, expires_at) so any rows whose consumed_at is
    NULL (legacy / future bugs) are still cleaned by their expires_at."""
    now = time.time()
    # Phase 1: transition stale pending → expired
    await conn.execute(
        "UPDATE tokens SET status='expired', consumed_at=? "
        "WHERE status='pending' AND expires_at < ?",
        (now, now),
    )
    # Phase 2: delete terminal rows older than threshold
    cutoff = now - max_age_days * 86400
    cur = await conn.execute(
        "DELETE FROM tokens "
        "WHERE status != 'pending' AND COALESCE(consumed_at, expires_at) < ?",
        (cutoff,),
    )
    await conn.commit()
    return cur.rowcount or 0
