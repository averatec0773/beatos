"""License-tier CRUD service.

v0.0.26 — replaces the placeholder track.license_type + track.price fields.
A track owns 0..N tiers; each tier carries name, deliverables (JSON array
of free string tokens), price, currency, and notes. The 2PC MCP write tool
uses set_license_tiers (whole-list replace), but the HTTP layer also
exposes per-tier mutation for the renderer's inline edits.
"""
from __future__ import annotations

import datetime as _dt
import json
from typing import Any, Optional

import aiosqlite

from beatos_core.db import resolve_db_path
from beatos_core.models import LicenseTier


_SELECT_COLS = (
    "id, track_id, position, name, deliverables, price, currency, notes, "
    "created_at, updated_at"
)

_WRITABLE_FIELDS = {"name", "deliverables", "price", "currency", "notes"}


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


def _deliverables_key(deliverables: list[str]) -> str:
    """Canonical (sorted, deduped) key for deliverables-set comparison —
    used to enforce per-track uniqueness. Order-insensitive: ['mp3','wav']
    and ['wav','mp3'] collide. Case-folded so 'MP3' and 'mp3' also
    collide (renderer lowercases custom inputs already)."""
    return json.dumps(sorted({d.lower() for d in deliverables}))


async def _find_duplicate_tier(
    conn: aiosqlite.Connection,
    track_id: int,
    deliverables: list[str],
    exclude_tier_id: Optional[int] = None,
) -> Optional[int]:
    """Return the id of an existing tier on `track_id` whose deliverables set
    matches `deliverables` (canonical), or None. Empty `deliverables` is
    never considered a duplicate — newly-added rows start empty by design.
    `exclude_tier_id` skips one row (used during update_tier so a tier
    doesn't conflict with itself)."""
    if not deliverables:
        return None
    target_key = _deliverables_key(deliverables)
    sql = "SELECT id, deliverables FROM license_tier WHERE track_id = ?"
    params: list[Any] = [track_id]
    if exclude_tier_id is not None:
        sql += " AND id != ?"
        params.append(exclude_tier_id)
    async with conn.execute(sql, tuple(params)) as cur:
        rows = await cur.fetchall()
    for tid, raw in rows:
        try:
            existing = json.loads(raw) if raw else []
        except (json.JSONDecodeError, TypeError):
            existing = []
        if isinstance(existing, list) and existing and _deliverables_key(existing) == target_key:
            return tid
    return None


def _row_to_tier(row: tuple) -> LicenseTier:
    deliverables_raw = row[4]
    try:
        deliverables = json.loads(deliverables_raw) if deliverables_raw else []
        if not isinstance(deliverables, list):
            deliverables = []
    except (json.JSONDecodeError, TypeError):
        deliverables = []
    return LicenseTier(
        id=row[0],
        track_id=row[1],
        position=row[2],
        name=row[3],
        deliverables=deliverables,
        price=row[5],
        currency=row[6] or "CNY",
        notes=row[7],
        created_at=_dt.datetime.fromisoformat(row[8]),
        updated_at=_dt.datetime.fromisoformat(row[9]),
    )


async def list_tiers_for_track(track_id: int) -> list[LicenseTier]:
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            f"SELECT {_SELECT_COLS} FROM license_tier "
            "WHERE track_id = ? ORDER BY position ASC, id ASC",
            (track_id,),
        ) as cur:
            rows = await cur.fetchall()
    return [_row_to_tier(r) for r in rows]


async def get_tier(tier_id: int) -> Optional[LicenseTier]:
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            f"SELECT {_SELECT_COLS} FROM license_tier WHERE id = ?",
            (tier_id,),
        ) as cur:
            row = await cur.fetchone()
    return _row_to_tier(row) if row else None


async def _next_position(conn: aiosqlite.Connection, track_id: int) -> int:
    async with conn.execute(
        "SELECT COALESCE(MAX(position), -1) + 1 FROM license_tier WHERE track_id = ?",
        (track_id,),
    ) as cur:
        row = await cur.fetchone()
    return int(row[0]) if row else 0


async def _track_exists(conn: aiosqlite.Connection, track_id: int) -> bool:
    async with conn.execute(
        "SELECT 1 FROM track WHERE id = ?", (track_id,)
    ) as cur:
        row = await cur.fetchone()
    return row is not None


async def create_tier(
    track_id: int,
    *,
    name: str = "",
    deliverables: Optional[list[str]] = None,
    price: Optional[float] = None,
    currency: str = "CNY",
    notes: Optional[str] = None,
) -> LicenseTier:
    # name is intentionally allowed empty: the renderer auto-derives a
    # display label from `deliverables` when name is blank, so forcing a
    # name on insert was a UX trap (the editor row layout has no Name
    # field by default — name lives behind the ⋮ expand).
    if not isinstance(name, str):
        raise ValueError("name must be a string")
    now = _now()
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        if not await _track_exists(conn, track_id):
            raise ValueError(f"Track {track_id} not found.")
        dupe = await _find_duplicate_tier(conn, track_id, deliverables or [])
        if dupe is not None:
            raise ValueError(
                f"A tier with the same deliverables already exists (id={dupe})"
            )
        position = await _next_position(conn, track_id)
        async with conn.execute(
            "INSERT INTO license_tier "
            "(track_id, position, name, deliverables, price, currency, notes, "
            " created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                track_id,
                position,
                name,
                json.dumps(deliverables or []),
                price,
                currency,
                notes,
                now,
                now,
            ),
        ) as cur:
            tier_id = cur.lastrowid
        await conn.commit()
    tier = await get_tier(tier_id)
    if tier is None:  # pragma: no cover — insert just succeeded
        raise RuntimeError("Tier vanished after insert")
    return tier


async def update_tier(tier_id: int, updates: dict[str, Any]) -> LicenseTier:
    unknown = set(updates.keys()) - _WRITABLE_FIELDS
    if unknown:
        raise ValueError(f"Unknown fields: {sorted(unknown)}")
    existing = await get_tier(tier_id)
    if existing is None:
        raise ValueError(f"License tier {tier_id} not found.")
    if not updates:
        return existing

    sets: list[str] = []
    values: list[Any] = []
    for field, value in updates.items():
        if field == "deliverables":
            if value is not None and not isinstance(value, list):
                raise ValueError("deliverables must be a list of strings")
            sets.append("deliverables = ?")
            values.append(json.dumps(value if value is not None else []))
            continue
        if field == "name":
            if value is None:
                raise ValueError("name must be a string")
            # Empty / whitespace-only names are accepted — the renderer
            # auto-derives a display label from deliverables in that case.
        sets.append(f"{field} = ?")
        values.append(value)
    sets.append("updated_at = ?")
    values.append(_now())
    values.append(tier_id)

    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        # If the caller is changing deliverables, enforce per-track
        # uniqueness against the *other* tiers (self excluded).
        if "deliverables" in updates:
            new_deliverables = updates.get("deliverables") or []
            if isinstance(new_deliverables, list):
                dupe = await _find_duplicate_tier(
                    conn,
                    existing.track_id,
                    new_deliverables,
                    exclude_tier_id=tier_id,
                )
                if dupe is not None:
                    raise ValueError(
                        f"A tier with the same deliverables already exists (id={dupe})"
                    )
        await conn.execute(
            f"UPDATE license_tier SET {', '.join(sets)} WHERE id = ?",
            tuple(values),
        )
        await conn.commit()
    tier = await get_tier(tier_id)
    if tier is None:  # pragma: no cover
        raise RuntimeError("Tier vanished after update")
    return tier


async def delete_tier(tier_id: int) -> None:
    existing = await get_tier(tier_id)
    if existing is None:
        raise ValueError(f"License tier {tier_id} not found.")
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute("DELETE FROM license_tier WHERE id = ?", (tier_id,))
        await conn.commit()


async def reorder_tiers(track_id: int, tier_ids: list[int]) -> None:
    """Assign positions 0..N-1 in the given order. Raises if ids contain
    duplicates, are not all members of the track, or fail to cover the
    track's tier set."""
    if len(tier_ids) != len(set(tier_ids)):
        raise ValueError("tier_ids contains duplicates")
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT id FROM license_tier WHERE track_id = ?", (track_id,)
        ) as cur:
            existing_ids = {r[0] for r in await cur.fetchall()}
        passed = set(tier_ids)
        if passed != existing_ids:
            missing = existing_ids - passed
            extra = passed - existing_ids
            raise ValueError(
                f"tier_ids does not match the track's tier set "
                f"(missing={sorted(missing)}, extra={sorted(extra)})"
            )
        for position, tier_id in enumerate(tier_ids):
            await conn.execute(
                "UPDATE license_tier SET position = ?, updated_at = ? WHERE id = ?",
                (position, _now(), tier_id),
            )
        await conn.commit()


async def replace_tiers_for_track(
    track_id: int, tiers: list[dict[str, Any]]
) -> list[LicenseTier]:
    """Atomic whole-list replace. Used by the MCP set_license_tiers tool —
    the agent submits a complete tier list; we drop existing rows and
    re-insert in the new order. Single transaction so the track is never
    observed mid-replace."""
    now = _now()
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        if not await _track_exists(conn, track_id):
            raise ValueError(f"Track {track_id} not found.")
        seen_keys: set[str] = set()
        for tier in tiers:
            name = tier.get("name", "")
            if not isinstance(name, str):
                raise ValueError("Each tier name must be a string")
            deliverables = tier.get("deliverables", [])
            if not isinstance(deliverables, list):
                raise ValueError("deliverables must be a list of strings")
            if deliverables:
                key = _deliverables_key(deliverables)
                if key in seen_keys:
                    raise ValueError(
                        f"Duplicate deliverables in batch: {sorted(set(deliverables))}"
                    )
                seen_keys.add(key)
        await conn.execute("DELETE FROM license_tier WHERE track_id = ?", (track_id,))
        for position, tier in enumerate(tiers):
            await conn.execute(
                "INSERT INTO license_tier "
                "(track_id, position, name, deliverables, price, currency, notes, "
                " created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    track_id,
                    position,
                    tier.get("name", ""),
                    json.dumps(tier.get("deliverables", [])),
                    tier.get("price"),
                    tier.get("currency") or "CNY",
                    tier.get("notes"),
                    now,
                    now,
                ),
            )
        await conn.commit()
    return await list_tiers_for_track(track_id)
