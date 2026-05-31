"""set_license_tiers MCP tool tests."""
import datetime as dt
import json

import aiosqlite
import pytest

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


async def _payload(db_path, token):
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT payload FROM tokens WHERE token=?", (token,)
        ) as cur:
            return json.loads((await cur.fetchone())[0])


@pytest.mark.asyncio
async def test_emits_token_with_normalized_payload(db_path):
    r = await set_license_tiers(
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
    assert "token" in r and r["token"]
    p = await _payload(db_path, r["token"])
    assert p["track_id"] == 1
    assert len(p["tiers"]) == 2
    # prices preserved as dicts; numbers normalized to float
    assert p["tiers"][0]["prices"] == {"CNY": 50.0}
    assert p["tiers"][1]["prices"] == {"CNY": 3500.0, "USD": 500.0}


@pytest.mark.asyncio
async def test_prices_keys_uppercased(db_path):
    r = await set_license_tiers(
        track_id=1,
        tiers=[{"name": "MP3", "deliverables": ["mp3"], "prices": {"cny": 50, "usd": 8}}],
    )
    p = await _payload(db_path, r["token"])
    assert p["tiers"][0]["prices"] == {"CNY": 50.0, "USD": 8.0}


@pytest.mark.asyncio
async def test_empty_tiers_allowed(db_path):
    r = await set_license_tiers(track_id=1, tiers=[])
    assert "token" in r
    p = await _payload(db_path, r["token"])
    assert p["tiers"] == []
    assert "Clear all license tiers" in p["preview"]["headline"]


@pytest.mark.asyncio
async def test_unknown_track_raises(db_path):
    with pytest.raises(ValueError, match="not found"):
        await set_license_tiers(track_id=9999, tiers=[{"name": "MP3"}])


@pytest.mark.asyncio
async def test_accepts_empty_tier_name(db_path):
    """Empty name is allowed — renderer derives display label from
    deliverables. See packages/beatos-core/.../licenses/service.py docstring."""
    r = await set_license_tiers(track_id=1, tiers=[{"name": ""}])
    assert "token" in r


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
async def test_share_passes_validate_and_survives_in_payload(db_path):
    """share in a tier must not be rejected by _validate_tier (unknown-field
    guard) and must appear in the staged token payload."""
    r = await set_license_tiers(
        track_id=1,
        tiers=[{"name": "MP3", "deliverables": ["mp3"], "prices": {"CNY": 50}, "share": 30.0}],
    )
    p = await _payload(db_path, r["token"])
    assert p["tiers"][0]["share"] == 30.0


@pytest.mark.asyncio
async def test_share_none_survives_in_payload(db_path):
    """Explicit null share must appear as None in the staged payload."""
    r = await set_license_tiers(
        track_id=1,
        tiers=[{"name": "MP3", "deliverables": ["mp3"], "share": None}],
    )
    p = await _payload(db_path, r["token"])
    assert p["tiers"][0]["share"] is None


@pytest.mark.asyncio
async def test_share_omitted_defaults_to_none_in_payload(db_path):
    """When share is omitted entirely from the tier, the payload must still
    carry share: None (not KeyError)."""
    r = await set_license_tiers(
        track_id=1,
        tiers=[{"name": "MP3", "deliverables": ["mp3"]}],
    )
    p = await _payload(db_path, r["token"])
    assert "share" in p["tiers"][0]
    assert p["tiers"][0]["share"] is None
