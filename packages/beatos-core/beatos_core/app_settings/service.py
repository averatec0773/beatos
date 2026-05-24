"""Catalog-level settings — a thin key/value JSON store backed by app_setting.

The store is intentionally untyped at this layer: values round-trip as JSON
and the caller (renderer / HTTP layer) decides on the schema for each key.
First consumer: `default_license_tiers`, a list of tier templates applied
to newly-created tracks.
"""
from __future__ import annotations

import datetime as _dt
import json
from typing import Any, Optional

import aiosqlite

from beatos_core.db import resolve_db_path


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


async def get_setting(key: str) -> Optional[Any]:
    """Return the decoded JSON value for `key`, or None when the key is
    absent. The caller is responsible for schema-validating the result."""
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT value_json FROM app_setting WHERE key = ?", (key,)
        ) as cur:
            row = await cur.fetchone()
    if row is None:
        return None
    try:
        return json.loads(row[0])
    except (json.JSONDecodeError, TypeError):
        return None


async def set_setting(key: str, value: Any) -> None:
    """Upsert the given key. `value` may be any JSON-serializable shape."""
    encoded = json.dumps(value)
    now = _now()
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            "INSERT INTO app_setting (key, value_json, updated_at) "
            "VALUES (?, ?, ?) "
            "ON CONFLICT(key) DO UPDATE SET "
            "  value_json = excluded.value_json, "
            "  updated_at = excluded.updated_at",
            (key, encoded, now),
        )
        await conn.commit()


async def delete_setting(key: str) -> None:
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute("DELETE FROM app_setting WHERE key = ?", (key,))
        await conn.commit()
