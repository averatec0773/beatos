"""list_sources tool."""
from __future__ import annotations

from beatos_mcp.db import connect

_COLS = "id, name, root_path, position, created_at"


async def list_sources() -> dict:
    async with connect() as conn:
        async with conn.execute(
            f"SELECT {_COLS} FROM source ORDER BY position ASC, id ASC"
        ) as cur:
            rows = await cur.fetchall()
    items = [
        {
            "id": r[0],
            "name": r[1],
            "root_path": r[2],
            "position": r[3],
            "created_at": r[4],
        }
        for r in rows
    ]
    return {"items": items}
