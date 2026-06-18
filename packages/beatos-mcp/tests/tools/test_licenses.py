"""set_license_tiers MCP tool tests — apply directly (L1), audit the preview."""
import datetime as dt
import json

import aiosqlite
import pytest

import beatos_http.handlers  # noqa: F401 — registers the apply handlers
from beatos_core.agent_log import list_agent_actions
from beatos_core.db import run_migrations
from beatos_mcp.tools.licenses import set_license_tiers


@pytest.fixture
async def db_path(tmp_path, monkeypatch):
    p = tmp_path / "t.db"
    await run_migrations(p)
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(p) as conn:
        await conn.execute(
            "INSERT INTO track (id, title, created_at, updated_at) "
            "VALUES (1, 'Beat A', ?, ?)",
            (now, now),
        )
        await conn.commit()
    return p


async def _latest_summary(db_path) -> dict:
    """The preview now lives in the audit log summary (no more token payload)."""
    async with aiosqlite.connect(db_path) as conn:
        rows = await list_agent_actions(conn, limit=1)
    return rows[0]["summary"]


async def _tiers(db_path) -> list[dict]:
    """Read back the persisted tiers (the normalized payload now lands in the DB)."""
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT name, deliverables, prices_json, notes, share "
            "FROM license_tier WHERE track_id=1 ORDER BY position"
        ) as cur:
            rows = await cur.fetchall()
    return [
        {
            "name": r[0],
            "deliverables": json.loads(r[1]) if r[1] else [],
            "prices": json.loads(r[2]) if r[2] else {},
            "notes": r[3],
            "share": r[4],
        }
        for r in rows
    ]


@pytest.mark.asyncio
async def test_applies_with_normalized_prices(db_path):
    res = await set_license_tiers(
        track_id=1,
        tiers=[
            {
                "name": "MP3",
                "deliverables": ["mp3"],
                "prices": {"CNY": 50},
                "notes": "Up to 5000 streams",
            },
            {
                "name": "WAV+Stems",
                "deliverables": ["mp3", "wav", "stem"],
                "prices": {"CNY": 3500, "USD": 500},
            },
        ],
    )
    assert res["status"] == "applied"
    assert res["result"]["track_id"] == 1
    assert res["result"]["tier_count"] == 2
    tiers = await _tiers(db_path)
    assert len(tiers) == 2
    # prices preserved as dicts; numbers normalized to float
    assert tiers[0]["prices"] == {"CNY": 50.0}
    assert tiers[1]["prices"] == {"CNY": 3500.0, "USD": 500.0}


@pytest.mark.asyncio
async def test_prices_keys_uppercased(db_path):
    await set_license_tiers(
        track_id=1,
        tiers=[{"name": "MP3", "deliverables": ["mp3"], "prices": {"cny": 50, "usd": 8}}],
    )
    tiers = await _tiers(db_path)
    assert tiers[0]["prices"] == {"CNY": 50.0, "USD": 8.0}


@pytest.mark.asyncio
async def test_empty_tiers_allowed(db_path):
    res = await set_license_tiers(track_id=1, tiers=[])
    assert res["status"] == "applied"
    assert res["result"]["tier_count"] == 0
    assert await _tiers(db_path) == []
    summ = await _latest_summary(db_path)
    assert "Clear all license tiers" in summ["headline"]


@pytest.mark.asyncio
async def test_unknown_track_raises(db_path):
    with pytest.raises(ValueError, match="not found"):
        await set_license_tiers(track_id=9999, tiers=[{"name": "MP3"}])


@pytest.mark.asyncio
async def test_accepts_empty_tier_name(db_path):
    """Empty name is allowed — renderer derives display label from
    deliverables. See packages/beatos-core/.../licenses/service.py docstring."""
    res = await set_license_tiers(track_id=1, tiers=[{"name": ""}])
    assert res["status"] == "applied"
    assert (await _tiers(db_path))[0]["name"] == ""


@pytest.mark.asyncio
async def test_rejects_negative_price(db_path):
    with pytest.raises(ValueError, match=">= 0"):
        await set_license_tiers(
            track_id=1, tiers=[{"name": "X", "prices": {"CNY": -1}}]
        )


@pytest.mark.asyncio
async def test_rejects_non_dict_prices(db_path):
    with pytest.raises(ValueError, match="object mapping"):
        await set_license_tiers(
            track_id=1, tiers=[{"name": "X", "prices": [["CNY", 100]]}]
        )


@pytest.mark.asyncio
async def test_rejects_unknown_tier_field(db_path):
    with pytest.raises(ValueError, match="unknown fields"):
        await set_license_tiers(track_id=1, tiers=[{"name": "X", "foo": "bar"}])


@pytest.mark.asyncio
async def test_rejects_legacy_price_currency_fields(db_path):
    """Old shape (price + currency at top level of tier) is now rejected —
    agents must use the `prices` dict instead. v0.0.27 boundary."""
    with pytest.raises(ValueError, match="unknown fields"):
        await set_license_tiers(
            track_id=1, tiers=[{"name": "X", "price": 50, "currency": "CNY"}]
        )


@pytest.mark.asyncio
async def test_too_many_tiers_rejected(db_path):
    with pytest.raises(ValueError, match="too many tiers"):
        await set_license_tiers(
            track_id=1,
            tiers=[{"name": f"T{i}"} for i in range(25)],
        )


# --- Gap 2 tests: share must survive _validate_tier and _normalize_tier ---

@pytest.mark.asyncio
async def test_share_passes_validate_and_survives(db_path):
    """share in a tier must not be rejected by _validate_tier (unknown-field
    guard) and must be persisted."""
    await set_license_tiers(
        track_id=1,
        tiers=[{"name": "MP3", "deliverables": ["mp3"], "prices": {"CNY": 50}, "share": 30.0}],
    )
    assert (await _tiers(db_path))[0]["share"] == 30.0


@pytest.mark.asyncio
async def test_share_none_survives(db_path):
    """Explicit null share must be persisted as NULL."""
    await set_license_tiers(
        track_id=1,
        tiers=[{"name": "MP3", "deliverables": ["mp3"], "share": None}],
    )
    assert (await _tiers(db_path))[0]["share"] is None


@pytest.mark.asyncio
async def test_share_omitted_defaults_to_none(db_path):
    """When share is omitted entirely from the tier, it persists as NULL
    (not KeyError)."""
    await set_license_tiers(
        track_id=1,
        tiers=[{"name": "MP3", "deliverables": ["mp3"]}],
    )
    assert (await _tiers(db_path))[0]["share"] is None
