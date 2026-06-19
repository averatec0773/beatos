"""Track CRUD service.

v0.0.4: tracks are global (no library). All operations target the global DB
resolved via BEATOS_DB_PATH (or ~/Music/BeatOS/global.db).
"""
from __future__ import annotations

import datetime as _dt
import json
from typing import Any, Optional

import aiosqlite

from beatos_core.assets._constants import AUDIO_ROLES
from beatos_core.db import resolve_db_path
from beatos_core.models import Track
from beatos_core.tracks.patch import apply_array_patch, FIELD_TO_COL, SCALAR_FIELDS
from beatos_core.tracks.sql_filter import (
    MULTI_VALUE_FIELDS,
    build_filter_clauses,
)

_WRITABLE_FIELDS = {
    "title",
    "bpm",
    "key_signature",
    "genre",
    "mood",
    "tags",
    "description",
    "producer",
    "is_free",
    "project_path",
}

SORTABLE_FIELDS = frozenset({
    "title", "bpm", "key_signature", "genre", "producer",
    "updated_at", "created_at",
})
SORT_DIRS = frozenset({"asc", "desc"})
DISTINCT_FIELDS = frozenset({"producer", "genre", "mood", "key_signature"})

# MULTI_VALUE_FIELDS is re-exported from sql_filter (single source of truth) so
# existing imports `from ...service import MULTI_VALUE_FIELDS` keep working.


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
    "tags, description, "
    "producer, "
    "created_at, updated_at, deleted_at, is_free, project_path"
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
# Role list derived from the canonical AUDIO_ROLES set (single source of truth);
# string concat (not f-string) keeps the literal `{prefix}` placeholder intact
# for the later .format(prefix=...) call.
_AUDIO_ROLES_SQL = "(" + ",".join(f"'{r}'" for r in sorted(AUDIO_ROLES)) + ")"
_HAS_AUDIO_SUBQUERY_TEMPLATE = (
    "EXISTS (SELECT 1 FROM asset ax2 "
    "WHERE ax2.track_id = {prefix}id "
    "AND ax2.missing = 0 "
    "AND ax2.role IN " + _AUDIO_ROLES_SQL +
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
    # Row layout (0-based) — v0.0.26 dropped license_type + price:
    # 0:id, 1:title, 2:bpm, 3:key_signature, 4:genre, 5:mood,
    # 6:tags, 7:description,
    # 8:producer, 9:created_at, 10:updated_at, 11:deleted_at, 12:is_free,
    # 13:project_path,
    # 14:cover_asset_id (optional), 15:has_audio (optional)
    tags = json.loads(row[6]) if row[6] else None
    deleted_at_raw = row[11] if len(row) > 11 else None
    return Track(
        id=row[0],
        title=row[1],
        bpm=row[2],
        key_signature=row[3],
        genre=_parse_json_list(row[4]),
        mood=_parse_json_list(row[5]),
        tags=tags,
        description=row[7],
        producer=_parse_json_list(row[8]),
        created_at=_dt.datetime.fromisoformat(row[9]),
        updated_at=_dt.datetime.fromisoformat(row[10]),
        deleted_at=_dt.datetime.fromisoformat(deleted_at_raw) if deleted_at_raw else None,
        is_free=bool(row[12]) if len(row) > 12 else False,
        project_path=row[13] if len(row) > 13 else None,
        cover_asset_id=row[14] if len(row) > 14 else None,
        has_audio=bool(row[15]) if len(row) > 15 else False,
    )


async def create_track(title: str) -> Track:
    now = _now()
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "INSERT INTO track (title, created_at, updated_at) VALUES (?, ?, ?)",
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
    producers_like: list[str] | None = None,
    genres_like: list[str] | None = None,
    moods_like: list[str] | None = None,
    keys_like: list[str] | None = None,
    bpm_min: int | None,
    bpm_max: int | None,
    has_audio: bool | None,
    text: list[str] | None = None,
) -> tuple[str, list]:
    """Filter clauses (excl. deleted_at) AND-joined into a single WHERE fragment.
    Delegates to the shared builder so HTTP and MCP search stay identical."""
    clauses, params = build_filter_clauses(
        producers=producers, genres=genres, moods=moods, keys=keys,
        producers_like=producers_like, genres_like=genres_like,
        moods_like=moods_like, keys_like=keys_like,
        bpm_min=bpm_min, bpm_max=bpm_max, has_audio=has_audio, text=text,
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
    producers_like: list[str] | None = None,
    genres_like: list[str] | None = None,
    moods_like: list[str] | None = None,
    keys_like: list[str] | None = None,
    bpm_min: int | None = None,
    bpm_max: int | None = None,
    has_audio: bool | None = None,
    q: str | None = None,
    text: list[str] | None = None,
) -> list[Track]:
    if sort_by not in SORTABLE_FIELDS:
        raise ValueError(f"sort_by must be one of {sorted(SORTABLE_FIELDS)}; got {sort_by!r}")
    if sort_dir not in SORT_DIRS:
        raise ValueError(f"sort_dir must be 'asc' or 'desc'; got {sort_dir!r}")

    where, params = _build_where(
        producers=producers, genres=genres, moods=moods, keys=keys,
        producers_like=producers_like, genres_like=genres_like,
        moods_like=moods_like, keys_like=keys_like,
        bpm_min=bpm_min, bpm_max=bpm_max, has_audio=has_audio,
        text=text if text is not None else ([t for t in q.split() if t] if q else None),
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


_TOP_FIELD_MAP = {
    "producer": ("producer", True),
    "genre": ("genre", True),
    "mood": ("mood", True),
    "key": ("key_signature", False),
}


async def list_top_values(field: str, limit: int = 8) -> list[dict]:
    if field not in _TOP_FIELD_MAP:
        raise ValueError(f"field must be one of {sorted(_TOP_FIELD_MAP)}; got {field!r}")
    column, is_json = _TOP_FIELD_MAP[field]
    limit = max(1, min(int(limit), 50))
    if is_json:
        sql = (
            f"SELECT je.value, COUNT(*) AS c "
            f"FROM track, json_each(track.{column}) je "
            f"WHERE track.{column} IS NOT NULL AND track.deleted_at IS NULL "
            f"GROUP BY je.value ORDER BY c DESC, je.value ASC LIMIT ?"
        )
    else:
        sql = (
            f"SELECT {column}, COUNT(*) AS c FROM track "
            f"WHERE {column} IS NOT NULL AND deleted_at IS NULL "
            f"GROUP BY {column} ORDER BY c DESC, {column} ASC LIMIT ?"
        )
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(sql, (limit,)) as cur:
            rows = await cur.fetchall()
    return [{"value": r[0], "count": r[1]} for r in rows]


async def count_tracks() -> int:
    """Return total count of non-trashed tracks."""
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT COUNT(*) FROM track WHERE deleted_at IS NULL"
        ) as cur:
            row = await cur.fetchone()
            return int(row[0]) if row else 0


async def count_unanalyzed() -> int:
    """Tracks with at least one non-missing audio asset but no BPM yet."""
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT COUNT(*) FROM track t "
            "WHERE t.deleted_at IS NULL AND t.bpm IS NULL "
            "AND EXISTS (SELECT 1 FROM asset a WHERE a.track_id = t.id "
            "AND a.missing = 0 AND a.role LIKE 'audio%')"
        ) as cur:
            (n,) = await cur.fetchone()
    return int(n)


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
    unknown = set(updates.keys()) - _WRITABLE_FIELDS
    if unknown:
        raise ValueError(f"Unknown field(s): {sorted(unknown)}")

    if not updates:
        current = await get_track(track_id)
        if current is None:
            raise ValueError(f"Track {track_id} not found.")
        return current

    if isinstance(updates.get("producer"), list):
        updates = {**updates, "producer": await canonicalize_producers(updates["producer"])}

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


async def bulk_update_tracks(ids: list[int], patch: dict) -> dict:
    """Apply one patch to many tracks. Scalar fields set directly; multi-value
    fields accept a list (replace) or {add?, remove?} delta. In-app direct write
    (no 2PC). Skips ids that no longer exist."""
    now = _now()
    db_path = resolve_db_path()
    updated = 0
    scalar_fields = [(FIELD_TO_COL[f], spec) for f, spec in patch.items() if f in SCALAR_FIELDS]
    array_fields = [(FIELD_TO_COL[f], spec) for f, spec in patch.items() if f not in SCALAR_FIELDS]
    async with aiosqlite.connect(db_path) as conn:
        producer_canon = (
            await _producer_canon_map_conn(conn)
            if any(col == "producer" for col, _ in array_fields)
            else None
        )
        # Pre-fetch every array-field column for all ids in one query (avoid N+1:
        # the per-id SELECT-then-UPDATE loop scaled at 2N round-trips on a bulk edit).
        current_arrays: dict[int, tuple] = {}
        if array_fields and ids:
            cols = ", ".join(col for col, _ in array_fields)
            placeholders = ",".join("?" * len(ids))
            async with conn.execute(
                f"SELECT id, {cols} FROM track WHERE id IN ({placeholders})", tuple(ids)
            ) as c0:
                async for r in c0:
                    current_arrays[r[0]] = r[1:]
        for tid in ids:
            sets: list[str] = []
            params: list = []
            for col, spec in scalar_fields:
                sets.append(f"{col}=?")
                params.append(spec)
            row = current_arrays.get(tid)
            if row is not None:
                for i, (col, spec) in enumerate(array_fields):
                    new_arr = apply_array_patch(row[i], spec)
                    if col == "producer" and producer_canon is not None:
                        new_arr = _apply_producer_canon(new_arr, producer_canon)
                    sets.append(f"{col}=?")
                    params.append(json.dumps(new_arr))
            if not sets:
                continue
            sets.append("updated_at=?")
            params.append(now)
            params.append(tid)
            cur = await conn.execute(
                f"UPDATE track SET {', '.join(sets)} WHERE id=?", params
            )
            if cur.rowcount == 1:
                updated += 1
        await conn.commit()
    return {"updated_count": updated, "ids": list(ids)}


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
        # FK enforcement is per-connection and off by default — without this the
        # ON DELETE CASCADE on asset/track_list/license_tier/analysis_cache is a
        # no-op and child rows are orphaned.
        await conn.execute("PRAGMA foreign_keys = ON")
        await conn.execute("DELETE FROM track WHERE id = ?", (track_id,))
        await conn.commit()


async def purge_all_trash() -> int:
    """Permanently delete every soft-deleted track. Returns count purged."""
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute("PRAGMA foreign_keys = ON")  # cascade child rows; see purge_track
        cursor = await conn.execute(
            "DELETE FROM track WHERE deleted_at IS NOT NULL",
        )
        await conn.commit()
        return cursor.rowcount


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


# --- producer case-insensitive canonicalization -------------------------------
# Producers are free-text JSON-array values, so "Metro" and "metro" used to count
# as two distinct producers (an agent over MCP would create the divergent casing).
# We canonicalize on write: a case-insensitive (casefold) match against existing
# producers reuses the existing casing. casefold() is the Unicode-correct way to
# compare case-insensitively.

def _canon_key(name: str) -> str:
    return name.strip().casefold()


def _build_canon_map(rows: list) -> dict[str, str]:
    """rows = (value, count) ordered count-desc; first casing per key wins
    (= the most-frequently used existing casing becomes canonical)."""
    canon: dict[str, str] = {}
    for value, _count in rows:
        if not isinstance(value, str):
            continue
        key = _canon_key(value)
        if key and key not in canon:
            canon[key] = value
    return canon


_CANON_SQL = (
    "SELECT je.value, COUNT(*) AS c "
    "FROM track, json_each(track.producer) je "
    "WHERE track.producer IS NOT NULL AND track.deleted_at IS NULL "
    "GROUP BY je.value ORDER BY c DESC, je.value ASC"
)


async def _producer_canon_map_conn(conn: aiosqlite.Connection) -> dict[str, str]:
    async with conn.execute(_CANON_SQL) as cur:
        rows = await cur.fetchall()
    return _build_canon_map(rows)


async def _producer_canon_map() -> dict[str, str]:
    async with aiosqlite.connect(resolve_db_path()) as conn:
        return await _producer_canon_map_conn(conn)


def _apply_producer_canon(names: list, canon: dict[str, str]) -> list[str]:
    """Map each name to its canonical casing (existing wins, else first-seen),
    dropping empties + case-insensitive duplicates while preserving order. Mutates
    `canon` so later items in the same list snap to an earlier one's casing."""
    out: list[str] = []
    seen: set[str] = set()
    for raw in names:
        if not isinstance(raw, str):
            continue
        s = raw.strip()
        if not s:
            continue
        key = s.casefold()
        if key in seen:
            continue
        seen.add(key)
        canonical = canon.get(key)
        if canonical is None:
            canon[key] = s  # this casing becomes canonical for later items
            canonical = s
        out.append(canonical)
    return out


async def canonicalize_producers(
    names: list, conn: aiosqlite.Connection | None = None
) -> list[str]:
    """Normalize a producer list against existing producers: a case-insensitive
    match reuses the existing casing (so 'metro' becomes 'Metro' when that already
    exists), and empties + case-insensitive duplicates are dropped. Single
    chokepoint every write path funnels through. Pass `conn` to read against an
    in-flight transaction (e.g. the MCP ingest batch)."""
    if not names:
        return []
    canon = await (_producer_canon_map_conn(conn) if conn is not None else _producer_canon_map())
    return _apply_producer_canon(names, canon)


async def normalize_producer_casing(*, dry_run: bool = False) -> dict:
    """One-time cleanup: merge existing producer values that differ only by case
    into one canonical casing (the most-frequently used). Returns the merge plan
    and the number of affected tracks. dry_run=True plans without mutating."""
    async with aiosqlite.connect(resolve_db_path()) as conn:
        async with conn.execute(_CANON_SQL) as cur:
            rows = await cur.fetchall()
    groups: dict[str, list[str]] = {}
    for value, _count in rows:
        if not isinstance(value, str):
            continue
        key = _canon_key(value)
        if key:
            groups.setdefault(key, []).append(value)  # already count-desc ordered

    plan: list[dict] = []
    for casings in groups.values():
        if len(casings) < 2:
            continue
        plan.append({"canonical": casings[0], "merged_from": casings[1:]})

    if dry_run:
        variants = [v for g in plan for v in g["merged_from"]]
        affected = await count_tracks_with_producer(variants) if variants else 0
        return {"groups": plan, "affected": affected, "dry_run": True}

    affected = 0
    for g in plan:
        # Only the non-canonical variants need rewriting; tracks already on the
        # canonical casing stay untouched (so the count = tracks actually changed,
        # matching the dry-run).
        affected += await rewrite_producer(g["merged_from"], g["canonical"])
    return {"groups": plan, "affected": affected, "dry_run": False}
