"""list_distinct_values: counts by field, sorted desc by count."""
from __future__ import annotations

import json

import aiosqlite
import pytest

from beatos_mcp.tools.distinct import list_distinct_values


async def _seed(db, rows: list[dict]):
    async with aiosqlite.connect(db) as conn:
        for r in rows:
            await conn.execute(
                "INSERT INTO track (title, producer, genre, mood, key_signature, bpm, "
                "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, '2026-05-18', '2026-05-18')",
                (r.get("title", "x"), r.get("producer"), r.get("genre"),
                 r.get("mood"), r.get("key_signature"), r.get("bpm")),
            )
        await conn.commit()


@pytest.mark.asyncio
async def test_distinct_producer_returns_value_and_count(fresh_db):
    await _seed(fresh_db, [
        {"producer": json.dumps(["Yung X"])},
        {"producer": json.dumps(["Yung X"])},
        {"producer": json.dumps(["Lazy Bee"])},
    ])
    result = await list_distinct_values("producer")
    items = result["items"]
    assert {(i["value"], i["count"]) for i in items} == {
        ("Yung X", 2), ("Lazy Bee", 1),
    }
    # Sorted by count desc.
    assert items[0]["count"] >= items[-1]["count"]


@pytest.mark.asyncio
async def test_distinct_key_signature_scalar_field(fresh_db):
    await _seed(fresh_db, [
        {"key_signature": "Am"}, {"key_signature": "Am"}, {"key_signature": "C#m"},
    ])
    result = await list_distinct_values("key")  # public name
    items = result["items"]
    by_value = {i["value"]: i["count"] for i in items}
    assert by_value == {"Am": 2, "C#m": 1}


@pytest.mark.asyncio
async def test_distinct_invalid_field_raises(fresh_db):
    with pytest.raises(ValueError, match="field must be one of"):
        await list_distinct_values("not_a_field")


@pytest.mark.asyncio
async def test_distinct_empty_db(fresh_db):
    result = await list_distinct_values("producer")
    assert result == {"items": []}
