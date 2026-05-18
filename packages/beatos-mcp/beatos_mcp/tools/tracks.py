"""list_tracks + get_track tools."""
from __future__ import annotations

import json
from typing import Any

from beatos_mcp.db import connect


class TrackNotFound(RuntimeError):
    """Raised when get_track(id) does not match any row."""


# Use fully-qualified column names so the same SELECT works in JOIN queries (T9 uses these).
_TRACK_COLS = (
    "track.id, track.title, track.producer, track.genre, track.mood, "
    "track.key_signature, track.bpm, track.description, track.description_draft, "
    "track.created_at, track.updated_at, track.deleted_at"
)
_ASSET_COLS = "id, track_id, role, abs_path, missing"


def _parse_json_array(raw: Any) -> list[str] | None:
    if raw is None:
        return None
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None
    return raw


def _row_to_track(row: tuple) -> dict:
    return {
        "id": row[0],
        "title": row[1],
        "producer": _parse_json_array(row[2]),
        "genre": _parse_json_array(row[3]),
        "mood": _parse_json_array(row[4]),
        "key_signature": row[5],
        "bpm": row[6],
        "description": row[7],
        "description_draft": row[8],
        "created_at": row[9],
        "updated_at": row[10],
        "deleted_at": row[11],
    }


def _row_to_asset(row: tuple) -> dict:
    return {
        "id": row[0],
        "track_id": row[1],
        "role": row[2],
        "abs_path": row[3],
        "missing": bool(row[4]),
    }


async def get_track(track_id: int) -> dict:
    async with connect() as conn:
        async with conn.execute(
            f"SELECT {_TRACK_COLS} FROM track WHERE track.id=? AND track.deleted_at IS NULL",
            (track_id,),
        ) as cur:
            row = await cur.fetchone()
        if row is None:
            raise TrackNotFound(f"Track {track_id} does not exist")
        track = _row_to_track(row)

        async with conn.execute(
            f"SELECT {_ASSET_COLS} FROM asset WHERE track_id=? ORDER BY role",
            (track_id,),
        ) as cur:
            asset_rows = await cur.fetchall()
        track["assets"] = [_row_to_asset(r) for r in asset_rows]
    return track
