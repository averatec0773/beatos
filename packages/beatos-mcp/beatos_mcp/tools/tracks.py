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


DEFAULT_LIMIT = 50
MAX_LIMIT = 500
_SORTABLE = {"created_at", "updated_at", "bpm", "name"}
_SORT_DIRS = {"asc", "desc"}
_SORT_COL = {"created_at": "created_at", "updated_at": "updated_at",
             "bpm": "bpm", "name": "title"}


def _multi_clause(field: str, values: list[str]) -> tuple[str, list]:
    placeholders = ", ".join("?" for _ in values)
    return (
        f"EXISTS (SELECT 1 FROM json_each(track.{field}) je "
        f"WHERE je.value IN ({placeholders}))",
        list(values),
    )


def _build_filter_clauses(
    *,
    producers: list[str] | None,
    genres: list[str] | None,
    moods: list[str] | None,
    keys: list[str] | None,
    bpm_min: float | None,
    bpm_max: float | None,
    has_audio: bool | None,
) -> tuple[list[str], list]:
    clauses: list[str] = ["track.deleted_at IS NULL"]
    params: list = []
    for field, values in [("producer", producers), ("genre", genres), ("mood", moods)]:
        if values:
            c, p = _multi_clause(field, values)
            clauses.append(c)
            params.extend(p)
    if keys:
        placeholders = ", ".join("?" for _ in keys)
        clauses.append(f"key_signature IN ({placeholders})")
        params.extend(keys)
    if bpm_min is not None:
        clauses.append("bpm >= ?")
        params.append(bpm_min)
    if bpm_max is not None:
        clauses.append("bpm <= ?")
        params.append(bpm_max)
    if has_audio is True:
        clauses.append(
            "EXISTS (SELECT 1 FROM asset ax WHERE ax.track_id=track.id "
            "AND ax.missing=0 AND ax.role IN "
            "('audio_tagged_mp3','audio_untagged_mp3','audio_tagged_wav','audio_untagged_wav'))"
        )
    elif has_audio is False:
        clauses.append(
            "NOT EXISTS (SELECT 1 FROM asset ax WHERE ax.track_id=track.id "
            "AND ax.missing=0 AND ax.role IN "
            "('audio_tagged_mp3','audio_untagged_mp3','audio_tagged_wav','audio_untagged_wav'))"
        )
    return clauses, params


async def list_tracks(
    *,
    source_id: int | None = None,
    list_id: int | None = None,
    producers: list[str] | None = None,
    genres: list[str] | None = None,
    moods: list[str] | None = None,
    keys: list[str] | None = None,
    bpm_min: float | None = None,
    bpm_max: float | None = None,
    has_audio: bool | None = None,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
) -> dict:
    if source_id is not None and list_id is not None:
        raise ValueError("source_id and list_id are mutually exclusive")
    if sort_by not in _SORTABLE:
        raise ValueError(f"sort_by must be one of {sorted(_SORTABLE)}; got {sort_by!r}")
    if sort_dir not in _SORT_DIRS:
        raise ValueError(f"sort_dir must be 'asc' or 'desc'; got {sort_dir!r}")

    limit = max(1, min(int(limit), MAX_LIMIT))
    offset = max(0, int(offset))

    clauses, params = _build_filter_clauses(
        producers=producers, genres=genres, moods=moods, keys=keys,
        bpm_min=bpm_min, bpm_max=bpm_max, has_audio=has_audio,
    )

    join = ""
    if list_id is not None:
        # Junction table is `track_list` (verified from 002_lists_and_index.sql).
        join = "JOIN track_list tl ON tl.track_id = track.id "
        clauses.append("tl.list_id = ?")
        params.append(list_id)
    elif source_id is not None:
        join = "JOIN asset asrc ON asrc.track_id = track.id "
        clauses.append(
            "EXISTS (SELECT 1 FROM source s WHERE s.id=? "
            "AND (asrc.abs_path GLOB s.root_path || '/*' OR asrc.abs_path = s.root_path))"
        )
        params.append(source_id)

    where = " AND ".join(clauses)
    sort_col = _SORT_COL[sort_by]

    count_sql = (
        f"SELECT COUNT(DISTINCT track.id) FROM track {join} WHERE {where}"
    )
    list_sql = (
        f"SELECT DISTINCT {_TRACK_COLS} FROM track {join} WHERE {where} "
        f"ORDER BY track.{sort_col} {sort_dir.upper()}, track.id ASC "
        f"LIMIT ? OFFSET ?"
    )

    async with connect() as conn:
        async with conn.execute(count_sql, params) as cur:
            total = (await cur.fetchone())[0]
        async with conn.execute(list_sql, params + [limit, offset]) as cur:
            rows = await cur.fetchall()

    items = [_row_to_track(r) for r in rows]
    out: dict = {
        "items": items,
        "total": total,
        "returned": len(items),
        "limit": limit,
        "offset": offset,
    }
    if total > offset + len(items):
        more = total - (offset + len(items))
        out["hint"] = f"{more} more match. Refine filter or use offset."
    return out
