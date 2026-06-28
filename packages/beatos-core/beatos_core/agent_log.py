"""Append-only audit log of applied agent write actions (L1 confirmation model).

Replaces the 2PC tokens table as the record of what an agent did. The in-app
dashboard reads it; nothing gates on it.
"""
from __future__ import annotations

import json
import time

import aiosqlite


async def record_agent_action(
    conn: aiosqlite.Connection,
    *,
    tool_name: str,
    summary: dict | None,
    client_name: str,
    status: str,
    result: dict | str,
) -> None:
    """Insert one audit row. Caller commits.

    `summary` is the tool's preview dict ({headline, sample, warnings}) when
    available. `result` may be a dict (JSON-encoded) or a plain error string.
    """
    await conn.execute(
        "INSERT INTO agent_action_log (ts, tool_name, summary, client_name, status, result) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (
            time.time(),
            tool_name,
            json.dumps(summary or {}),
            client_name or "",
            status,
            result if isinstance(result, str) else json.dumps(result),
        ),
    )


async def list_agent_actions(conn: aiosqlite.Connection, limit: int = 100) -> list[dict]:
    """Return the most recent audit rows, newest first. Includes the row `id` so
    the dashboard can delete individual entries."""
    async with conn.execute(
        "SELECT id, ts, tool_name, summary, client_name, status, result "
        "FROM agent_action_log ORDER BY ts DESC, id DESC LIMIT ?",
        (int(limit),),
    ) as cur:
        rows = await cur.fetchall()

    out: list[dict] = []
    for row_id, ts, tool, summ, client, status, res in rows:
        try:
            res_v = json.loads(res) if res else {}
        except json.JSONDecodeError:
            res_v = res
        out.append(
            {
                "id": row_id,
                "ts": ts,
                "tool_name": tool,
                "summary": json.loads(summ) if summ else {},
                "client_name": client,
                "status": status,
                "result": res_v,
            }
        )
    return out


async def delete_agent_action(conn: aiosqlite.Connection, action_id: int) -> bool:
    """Delete one audit row by id. Caller commits. Returns True if a row matched."""
    cur = await conn.execute("DELETE FROM agent_action_log WHERE id = ?", (int(action_id),))
    return (cur.rowcount or 0) > 0


async def clear_agent_actions(conn: aiosqlite.Connection) -> int:
    """Delete every audit row. Caller commits. Returns how many were removed."""
    cur = await conn.execute("DELETE FROM agent_action_log")
    return cur.rowcount or 0
