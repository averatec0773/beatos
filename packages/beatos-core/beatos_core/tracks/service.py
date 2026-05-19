"""Track CRUD service.

v0.0.4: tracks are global (no library). All operations target the global DB
resolved via BEATOS_DB_PATH (or ~/Music/BeatOS/global.db).
Rejects writes to description_draft (sacred — charter §18 rule 4).
"""
from __future__ import annotations

import datetime as _dt
import json
from typing import Any, Optional

import aiosqlite

from beatos_core.db import resolve_db_path
from beatos_core.models import Track

_WRITABLE_FIELDS = {
    "title",
    "bpm",
    "key_signature",
    "genre",
    "mood",
    "tags",
    "description",
    "license_type",
    "price",
    "producer",
}

_FORBIDDEN_FIELDS = {"description_draft"}

SORTABLE_FIELDS = frozenset({
    "title", "bpm", "key_signature", "genre", "producer",
    "updated_at", "created_at",
})
SORT_DIRS = frozenset({"asc", "desc"})
DISTINCT_FIELDS = frozenset({"producer", "genre", "mood", "key_signature"})

# Fields stored as JSON arrays in the DB.
MULTI_VALUE_FIELDS = frozenset({"producer", "genre", "mood"})


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


def _serialize(value: Any, field: str) -> Any:
    if field in MULTI_VALUE_FIELDS and isinstance(value, list):
        return json.dumps(value)
    if field == "tags" and value is not None:
        return json.dumps(value)
    return value


def _sort_expr(sort_by: str) -> str:
    """Return the SQL expression used in ORDER BY for the given sort key."""
    if sort_by in MULTI_VALUE_FIELDS:
        return f"json_extract(track.{sort_by}, '$[0]')"
    return sort_by


_SELECT_COLS = (
    "id, title, bpm, key_signature, genre, mood, "
    "tags, description, description_draft, license_type, price, "
    "producer, "
    "created_at, updated_at, deleted_at"
)

# Subquery rendered after _SELECT_COLS to populate Track.cover_asset_id.
# Uses a distinct alias `ax` for the inner asset reference so it cannot
# shadow an outer `asset a` join.
_COVER_SUBQUERY_TEMPLATE = (
    "(SELECT ax.id FROM asset ax "
    "WHERE ax.track_id = {prefix}id AND ax.role = 'cover' LIMIT 1) AS cover_asset_id"
)

# Subquery to derive has_audio: EXISTS over non-missing audio assets.
# Uses alias `ax2` to avoid collision with the cover subquery alias `ax`.
_HAS_AUDIO_SUBQUERY_TEMPLATE = (
    "EXISTS (SELECT 1 FROM asset ax2 "
    "WHERE ax2.track_id = {prefix}id "
    "AND ax2.missing = 0 "
    "AND ax2.role IN ('audio_tagged_mp3','audio_untagged_mp3','audio_tagged_wav','audio_untagged_wav')"
    ") AS has_audio"
)


def _cover_subquery(prefix: str = "track.") -> str:
    """Render the cover-id correlated subquery for a given outer-table alias.

    `prefix` is the outer table reference including dot, e.g. "track." or "t.".
    Defaults to "track." for unaliased queries.
    """
    return _COVER_SUBQUERY_TEMPLATE.format(prefix=prefix)


def _has_audio_subquery(prefix: str = "track.") -> str:
    """Render the has_audio EXISTS subquery for a given outer-table alias."""
    return _HAS_AUDIO_SUBQUERY_TEMPLATE.format(prefix=prefix)


def _parse_json_list(raw: Any) -> Optional[list[str]]:
    """Parse a JSON-array TEXT column into a list, or None when NULL."""
    if raw is None:
        return None
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return parsed
    except (json.JSONDecodeError, TypeError):
        pass
    return None


def _deserialize(row: tuple) -> Track:
    # Row layout (0-based):
    # 0:id, 1:title, 2:bpm, 3:key_signature, 4:genre, 5:mood,
    # 6:tags, 7:description, 8:description_draft, 9:license_type, 10:price,
    # 11:producer, 12:created_at, 13:updated_at, 14:deleted_at,
    # 15:cover_asset_id (optional), 16:has_audio (optional)
    tags = json.loads(row[6]) if row[6] else None
    deleted_at_raw = row[14] if len(row) > 14 else None
    return Track(
        id=row[0],
        title=row[1],
        bpm=row[2],
        key_signature=row[3],
        genre=_parse_json_list(row[4]),
        mood=_parse_json_list(row[5]),
        tags=tags,
        description=row[7],
        description_draft=row[8],
        license_type=row[9],
        price=row[10],
        producer=_parse_json_list(row[11]),
        created_at=_dt.datetime.fromisoformat(row[12]),
        updated_at=_dt.datetime.fromisoformat(row[13]),
        deleted_at=_dt.datetime.fromisoformat(deleted_at_raw) if deleted_at_raw else None,
        cover_asset_id=row[15] if len(row) > 15 else None,
        has_audio=bool(row[16]) if len(row) > 16 else False,
    )


async def create_track(title: str) -> Track:
    now = _now()
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "INSERT INTO track (title, license_type, created_at, updated_at) "
            "VALUES (?, 'lease_basic', ?, ?)",
            (title, now, now),
        ) as cur:
            track_id = cur.lastrowid
        await conn.commit()
        async with conn.execute(
            f"SELECT {_SELECT_COLS}, {_cover_subquery()}, {_has_audio_subquery()} FROM track WHERE id = ?",
            (track_id,),
        ) as cur:
            row = await cur.fetchone()
    return _deserialize(row)


def _build_where(
    *,
    producers: list[str] | None,
    genres: list[str] | None,
    moods: list[str] | None,
    keys: list[str] | None,
    bpm_min: int | None,
    bpm_max: int | None,
    has_audio: bool | None,
) -> tuple[str, list]:
    clauses: list[str] = []
    params: list = []
    for field, values in [
        ("producer", producers), ("genre", genres), ("mood", moods), ("key_signature", keys),
    ]:
        if values:
            placeholders = ", ".join("?" for _ in values)
            if field in MULTI_VALUE_FIELDS:
                clauses.append(
                    f"EXISTS (SELECT 1 FROM json_each(track.{field}) je "
                    f"WHERE je.value IN ({placeholders}))"
                )
            else:
                clauses.append(f"{field} IN ({placeholders})")
            params.extend(values)
    if bpm_min is not None:
        clauses.append("bpm >= ?")
        params.append(bpm_min)
    if bpm_max is not None:
        clauses.append("bpm <= ?")
        params.append(bpm_max)
    if has_audio is True:
        clauses.append(
            "EXISTS (SELECT 1 FROM asset ax3 "
            "WHERE ax3.track_id = track.id AND ax3.missing = 0 "
            "AND ax3.role IN ('audio_tagged_mp3','audio_untagged_mp3','audio_tagged_wav','audio_untagged_wav'))"
        )
    elif has_audio is False:
        clauses.append(
            "NOT EXISTS (SELECT 1 FROM asset ax3 "
            "WHERE ax3.track_id = track.id AND ax3.missing = 0 "
            "AND ax3.role IN ('audio_tagged_mp3','audio_untagged_mp3','audio_tagged_wav','audio_untagged_wav'))"
        )
    return (" AND ".join(clauses), params)


async def list_tracks(
    *,
    sort_by: str = "updated_at",
    sort_dir: str = "desc",
    producers: list[str] | None = None,
    genres: list[str] | None = None,
    moods: list[str] | None = None,
    keys: list[str] | None = None,
    bpm_min: int | None = None,
    bpm_max: int | None = None,
    has_audio: bool | None = None,
) -> list[Track]:
    if sort_by not in SORTABLE_FIELDS:
        raise ValueError(f"sort_by must be one of {sorted(SORTABLE_FIELDS)}; got {sort_by!r}")
    if sort_dir not in SORT_DIRS:
        raise ValueError(f"sort_dir must be 'asc' or 'desc'; got {sort_dir!r}")

    where, params = _build_where(
        producers=producers, genres=genres, moods=moods, keys=keys,
        bpm_min=bpm_min, bpm_max=bpm_max, has_audio=has_audio,
    )
    sort_expr = _sort_expr(sort_by)
    base_where = "track.deleted_at IS NULL"
    full_where = f"{base_where} AND {where}" if where else base_where
    sql = (
        f"SELECT {_SELECT_COLS}, {_cover_subquery()}, {_has_audio_subquery()} "
        f"FROM track "
        f"WHERE {full_where} "
        f"ORDER BY {sort_expr} {sort_dir.upper()}, id ASC"
    )
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(sql, params) as cur:
            rows = await cur.fetchall()
    return [_deserialize(r) for r in rows]


async def list_distinct_values(field: str) -> list[str]:
    if field not in DISTINCT_FIELDS:
        raise ValueError(f"field must be one of {sorted(DISTINCT_FIELDS)}; got {field!r}")
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        if field in MULTI_VALUE_FIELDS:
            sql = (
                f"SELECT DISTINCT je.value FROM track, json_each(track.{field}) je "
                f"WHERE track.{field} IS NOT NULL AND track.deleted_at IS NULL ORDER BY je.value"
            )
        else:
            sql = (
                f"SELECT DISTINCT {field} FROM track "
                f"WHERE {field} IS NOT NULL AND deleted_at IS NULL ORDER BY {field}"
            )
        async with conn.execute(sql) as cur:
            rows = await cur.fetchall()
    return [r[0] for r in rows]


async def get_track(track_id: int) -> Optional[Track]:
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            f"SELECT {_SELECT_COLS}, {_cover_subquery()}, {_has_audio_subquery()} FROM track WHERE id = ?",
            (track_id,),
        ) as cur:
            row = await cur.fetchone()
    return _deserialize(row) if row else None


async def update_track(track_id: int, updates: dict[str, Any]) -> Track:
    forbidden = set(updates.keys()) & _FORBIDDEN_FIELDS
    if forbidden:
        raise ValueError(f"Cannot update sacred field(s): {sorted(forbidden)}")

    unknown = set(updates.keys()) - _WRITABLE_FIELDS
    if unknown:
        raise ValueError(f"Unknown field(s): {sorted(unknown)}")

    if not updates:
        current = await get_track(track_id)
        if current is None:
            raise ValueError(f"Track {track_id} not found.")
        return current

    sets: list[str] = []
    values: list[Any] = []
    for field, value in updates.items():
        sets.append(f"{field} = ?")
        values.append(_serialize(value, field))
    sets.append("updated_at = ?")
    values.append(_now())
    values.append(track_id)

    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            f"UPDATE track SET {', '.join(sets)} WHERE id = ?",
            tuple(values),
        )
        await conn.commit()

    current = await get_track(track_id)
    if current is None:
        raise ValueError(f"Track {track_id} not found.")
    return current


async def trash_track(track_id: int) -> Track:
    now = _now()
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            "UPDATE track SET deleted_at = ? WHERE id = ?",
            (now, track_id),
        )
        await conn.commit()
    track = await get_track(track_id)
    if track is None:
        raise ValueError(f"Track {track_id} not found.")
    return track


async def restore_track(track_id: int) -> Track:
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            "UPDATE track SET deleted_at = NULL WHERE id = ?",
            (track_id,),
        )
        await conn.commit()
    track = await get_track(track_id)
    if track is None:
        raise ValueError(f"Track {track_id} not found.")
    return track


async def purge_track(track_id: int) -> None:
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute("DELETE FROM track WHERE id = ?", (track_id,))
        await conn.commit()


async def list_trash() -> list[Track]:
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            f"SELECT {_SELECT_COLS}, {_cover_subquery()}, {_has_audio_subquery()} "
            "FROM track "
            "WHERE track.deleted_at IS NOT NULL "
            "ORDER BY track.deleted_at DESC, id ASC",
        ) as cur:
            rows = await cur.fetchall()
    return [_deserialize(r) for r in rows]


async def delete_track(track_id: int) -> None:
    await trash_track(track_id)


async def count_tracks_with_producer(values: list[str]) -> int:
    """Count non-trashed tracks whose producer array contains any of `values`."""
    if not values:
        return 0
    db_path = resolve_db_path()
    placeholders = ", ".join("?" for _ in values)
    sql = (
        f"SELECT COUNT(*) FROM track "
        f"WHERE deleted_at IS NULL AND EXISTS ("
        f"  SELECT 1 FROM json_each(track.producer) je WHERE je.value IN ({placeholders})"
        f")"
    )
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(sql, values) as cur:
            row = await cur.fetchone()
    return row[0] if row else 0


async def rewrite_producer(from_values: list[str], to_value: str | None) -> int:
    """Replace producer values across all tracks.

    - rename:  from_values=["Drake"],          to_value="drake"
    - merge:   from_values=["Drake","drake"],  to_value="Drake"
    - delete:  from_values=["Drake"],          to_value=None

    Per-track: removes every matching value; if `to_value` is non-empty and
    not already present in the array after removal, appends it. Preserves
    other producers' order. Empty arrays are kept as `[]` (not converted
    to NULL) so the column stays uniform.

    Returns the number of rows actually updated.
    """
    if not from_values:
        return 0
    db_path = resolve_db_path()
    placeholders = ", ".join("?" for _ in from_values)
    target = to_value.strip() if isinstance(to_value, str) else None
    if target == "":
        target = None
    from_set = set(from_values)

    select_sql = (
        f"SELECT id, producer FROM track "
        f"WHERE deleted_at IS NULL AND EXISTS ("
        f"  SELECT 1 FROM json_each(track.producer) je WHERE je.value IN ({placeholders})"
        f")"
    )
    now = _now()
    updated = 0
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(select_sql, from_values) as cur:
            rows = await cur.fetchall()
        for track_id, producer_raw in rows:
            current = _parse_json_list(producer_raw) or []
            kept = [v for v in current if v not in from_set]
            if target is not None and target not in kept:
                kept.append(target)
            updated += 1
            new_raw = json.dumps(kept)
            if new_raw == producer_raw:
                # No-op write — skip to avoid bumping updated_at, but the track
                # still matched the filter so count it as affected (matches
                # what /api/producers/preview reports).
                continue
            await conn.execute(
                "UPDATE track SET producer = ?, updated_at = ? WHERE id = ?",
                (new_raw, now, track_id),
            )
        await conn.commit()
    return updated
