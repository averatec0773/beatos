"""License-tier tool: set_license_tiers (whole-list replace).

Pattern follows reorder_list / update_tracks (v0.0.23-v0.0.24): the tool
validates the payload, looks up track context for the preview, and
hands a 2PC token back to the user. The HTTP handler applies the actual
license_tier replace inside a single transaction (see handlers/licenses.py).
"""
from __future__ import annotations

from typing import Any

from beatos_core.two_phase import create_token
from beatos_mcp.db import connect_writable
from beatos_mcp.preview import build_preview


_MAX_TIERS = 20
_MAX_NAME = 200
_MAX_DELIVERABLES = 20
_MAX_DELIVERABLE_TOKEN = 64
_MAX_CURRENCY = 8
_MAX_NOTES = 2000


def _validate_tier(tier: Any, index: int) -> None:
    if not isinstance(tier, dict):
        raise ValueError(f"tiers[{index}] must be an object")
    name = tier.get("name")
    if not isinstance(name, str) or not name.strip():
        raise ValueError(f"tiers[{index}].name must be a non-empty string")
    if len(name) > _MAX_NAME:
        raise ValueError(f"tiers[{index}].name too long (>{_MAX_NAME} chars)")
    deliverables = tier.get("deliverables", [])
    if not isinstance(deliverables, list):
        raise ValueError(f"tiers[{index}].deliverables must be a list")
    if len(deliverables) > _MAX_DELIVERABLES:
        raise ValueError(
            f"tiers[{index}].deliverables too many (>{_MAX_DELIVERABLES})"
        )
    for j, d in enumerate(deliverables):
        if not isinstance(d, str) or not d:
            raise ValueError(
                f"tiers[{index}].deliverables[{j}] must be a non-empty string"
            )
        if len(d) > _MAX_DELIVERABLE_TOKEN:
            raise ValueError(
                f"tiers[{index}].deliverables[{j}] too long (>{_MAX_DELIVERABLE_TOKEN} chars)"
            )
    price = tier.get("price")
    if price is not None:
        if isinstance(price, bool) or not isinstance(price, (int, float)):
            raise ValueError(f"tiers[{index}].price must be a number or null")
        if price < 0:
            raise ValueError(f"tiers[{index}].price must be >= 0")
    currency = tier.get("currency")
    if currency is not None:
        if not isinstance(currency, str) or not currency.strip():
            raise ValueError(
                f"tiers[{index}].currency must be a non-empty string when present"
            )
        if len(currency) > _MAX_CURRENCY:
            raise ValueError(
                f"tiers[{index}].currency too long (>{_MAX_CURRENCY} chars)"
            )
    notes = tier.get("notes")
    if notes is not None:
        if not isinstance(notes, str):
            raise ValueError(f"tiers[{index}].notes must be a string or null")
        if len(notes) > _MAX_NOTES:
            raise ValueError(f"tiers[{index}].notes too long (>{_MAX_NOTES} chars)")
    unknown = set(tier.keys()) - {
        "name",
        "deliverables",
        "price",
        "currency",
        "notes",
    }
    if unknown:
        raise ValueError(f"tiers[{index}] has unknown fields: {sorted(unknown)}")


def _normalize_tier(tier: dict[str, Any]) -> dict[str, Any]:
    """Whitelist + default the fields stored in the token payload."""
    return {
        "name": tier["name"],
        "deliverables": list(tier.get("deliverables") or []),
        "price": tier.get("price"),
        "currency": tier.get("currency") or "CNY",
        "notes": tier.get("notes"),
    }


def _format_tier(tier: dict[str, Any]) -> str:
    parts: list[str] = [tier["name"]]
    deliverables = tier.get("deliverables") or []
    if deliverables:
        parts.append("/".join(deliverables))
    price = tier.get("price")
    if price is not None:
        parts.append(f"{tier.get('currency') or 'CNY'} {price}")
    return " · ".join(parts)


async def set_license_tiers(track_id: int, tiers: list[dict[str, Any]]) -> dict:
    """Replace the full license tier list for a track. tiers may be empty
    to clear all existing tiers. Returns a 2PC token."""
    if not isinstance(track_id, int) or isinstance(track_id, bool) or track_id <= 0:
        raise ValueError("track_id must be a positive integer")
    if not isinstance(tiers, list):
        raise ValueError("tiers must be a list")
    if len(tiers) > _MAX_TIERS:
        raise ValueError(f"too many tiers (max {_MAX_TIERS})")
    for i, tier in enumerate(tiers):
        _validate_tier(tier, i)
    normalized = [_normalize_tier(t) for t in tiers]

    async with connect_writable() as conn:
        async with conn.execute(
            "SELECT id, title FROM track WHERE id = ?", (track_id,)
        ) as cur:
            row = await cur.fetchone()
    if row is None:
        raise ValueError(f"track id={track_id} not found")
    title = row[1]

    if normalized:
        sample_lines = "\n".join(f"  - {_format_tier(t)}" for t in normalized[:5])
        if len(normalized) > 5:
            sample_lines += f"\n  - … and {len(normalized) - 5} more"
        headline = (
            f"Replace license tiers on \"{title}\" ({len(normalized)} tier"
            f"{'s' if len(normalized) != 1 else ''})"
        )
    else:
        sample_lines = "  (no tiers — track will have no license set)"
        headline = f"Clear all license tiers on \"{title}\""

    payload = {
        "track_id": track_id,
        "tiers": normalized,
        "preview": build_preview(headline=headline, sample=sample_lines, warnings=[]),
    }
    async with connect_writable() as conn:
        token = await create_token(conn, "set_license_tiers", payload)
        async with conn.execute(
            "SELECT expires_at FROM tokens WHERE token=?", (token,)
        ) as cur:
            exp = await cur.fetchone()
    return {
        "token": token,
        "expires_at": exp[0],
        "message": "Awaiting human approval. Open BeatOS → Approvals.",
    }
