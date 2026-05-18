"""list_lists tool."""
from __future__ import annotations

from beatos_mcp.db import connect

_COLS = "id, name, kind, position, created_at"


async def list_lists() -> dict:
    async with connect() as conn:
        async with conn.execute(
            f"SELECT {_COLS} FROM list ORDER BY position ASC, id ASC"
        ) as cur:
            rows = await cur.fetchall()
    items = [
        {
            "id": r[0],
            "name": r[1],
            "kind": r[2],
            "position": r[3],
            "created_at": r[4],
        }
        for r in rows
    ]
    return {"items": items}
