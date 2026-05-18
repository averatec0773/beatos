"""list_distinct_values tool: surface the actual vocabulary in the user's library.

AI clients use this before calling list_tracks so they filter with the user's
real spelling (e.g. 'trap' vs 'Trap') instead of guessing.
"""
from __future__ import annotations

from beatos_mcp.db import connect

# Public field name -> (db column, is_json_array)
_FIELD_MAP = {
    "producer": ("producer", True),
    "genre": ("genre", True),
    "mood": ("mood", True),
    "key": ("key_signature", False),
}


async def list_distinct_values(field: str) -> dict:
    if field not in _FIELD_MAP:
        raise ValueError(
            f"field must be one of {sorted(_FIELD_MAP)}; got {field!r}"
        )
    column, is_json = _FIELD_MAP[field]

    if is_json:
        sql = (
            f"SELECT je.value, COUNT(*) AS c "
            f"FROM track, json_each(track.{column}) je "
            f"WHERE track.{column} IS NOT NULL AND track.deleted_at IS NULL "
            f"GROUP BY je.value ORDER BY c DESC, je.value ASC"
        )
    else:
        sql = (
            f"SELECT {column}, COUNT(*) AS c FROM track "
            f"WHERE {column} IS NOT NULL AND deleted_at IS NULL "
            f"GROUP BY {column} ORDER BY c DESC, {column} ASC"
        )

    async with connect() as conn:
        async with conn.execute(sql) as cur:
            rows = await cur.fetchall()
    return {"items": [{"value": r[0], "count": r[1]} for r in rows]}
