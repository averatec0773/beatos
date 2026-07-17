"""License-tier tool: set_license_tiers (whole-list replace).

v0.0.27 — multi-currency. Each tier carries `prices: {CNY: 300, USD: 50}`
instead of the old `price + currency` pair, so an agent can quote multiple
currencies on the same tier in a single call.

Pattern follows reorder_list / update_tracks: the tool validates the payload,
looks up track context for the preview, then routes through `submit_write`,
which applies the license_tier replace directly in a single transaction (see
handlers/licenses.py) and records the action.
"""
from __future__ import annotations

from typing import Any

from beatos_mcp.db import connect_writable
from beatos_mcp.policy import submit_write
from beatos_mcp.preview import build_preview


_MAX_TIERS = 20
_MAX_NAME = 200
_MAX_DELIVERABLES = 20
_MAX_DELIVERABLE_TOKEN = 64
_MAX_CURRENCY_CODE = 8
_MAX_PRICES = 16
_MAX_NOTES = 2000


def _validate_prices(prices: Any, *, index: int) -> dict[str, float]:
    if prices is None:
        return {}
    if not isinstance(prices, dict):
        raise ValueError(
            f"tiers[{index}].prices must be an object mapping currency → amount"
        )
    if len(prices) > _MAX_PRICES:
        raise ValueError(
            f"tiers[{index}].prices has too many currencies (>{_MAX_PRICES})"
        )
    normalized: dict[str, float] = {}
    for code, amount in prices.items():
        if not isinstance(code, str) or not code.strip():
            raise ValueError(
                f"tiers[{index}].prices keys must be non-empty currency codes"
            )
        if len(code) > _MAX_CURRENCY_CODE:
            raise ValueError(
                f"tiers[{index}].prices currency code too long (>{_MAX_CURRENCY_CODE}): {code!r}"
            )
        if isinstance(amount, bool) or not isinstance(amount, (int, float)):
            raise ValueError(
                f"tiers[{index}].prices[{code!r}] must be a number"
            )
        if amount < 0:
            raise ValueError(
                f"tiers[{index}].prices[{code!r}] must be >= 0"
            )
        normalized[code.upper().strip()] = float(amount)
    return normalized


def _validate_tier(tier: Any, index: int) -> None:
    if not isinstance(tier, dict):
        raise ValueError(f"tiers[{index}] must be an object")
    # name is optional — the renderer auto-derives a display label from
    # deliverables when blank. Agents may still set it for canonical
    # tier-naming (e.g. "Premium Lease"); just require it to be a string.
    name = tier.get("name", "")
    if not isinstance(name, str):
        raise ValueError(f"tiers[{index}].name must be a string")
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
    _validate_prices(tier.get("prices"), index=index)
    notes = tier.get("notes")
    if notes is not None:
        if not isinstance(notes, str):
            raise ValueError(f"tiers[{index}].notes must be a string or null")
        if len(notes) > _MAX_NOTES:
            raise ValueError(f"tiers[{index}].notes too long (>{_MAX_NOTES} chars)")
    share = tier.get("share")
    if share is not None:
        if isinstance(share, bool) or not isinstance(share, (int, float)):
            raise ValueError(f"tiers[{index}].share must be a number or null")
        if share < 0 or share > 100:
            raise ValueError(f"tiers[{index}].share must be between 0 and 100")
    unknown = set(tier.keys()) - {
        "name",
        "deliverables",
        "prices",
        "notes",
        "share",
    }
    if unknown:
        raise ValueError(f"tiers[{index}] has unknown fields: {sorted(unknown)}")


def _normalize_tier(tier: dict[str, Any]) -> dict[str, Any]:
    """Whitelist + default the fields passed to the write handler."""
    share = tier.get("share")
    return {
        "name": tier.get("name", "") or "",
        "deliverables": list(tier.get("deliverables") or []),
        "prices": _validate_prices(tier.get("prices"), index=0),
        "notes": tier.get("notes"),
        "share": float(share) if share is not None else None,
    }


def _format_prices(prices: dict[str, float]) -> str:
    if not prices:
        return "no price"
    # Stable order so the approval card preview reads the same on every render.
    items = sorted(prices.items())
    return " / ".join(f"{code} {amount:g}" for code, amount in items)


def _format_tier(tier: dict[str, Any]) -> str:
    parts: list[str] = []
    name = tier.get("name") or ""
    if name.strip():
        parts.append(name)
    deliverables = tier.get("deliverables") or []
    if deliverables:
        parts.append("/".join(deliverables))
    prices = tier.get("prices") or {}
    parts.append(_format_prices(prices))
    return " · ".join(parts) if parts else "(untitled)"


async def set_license_tiers(track_id: int, tiers: list[dict[str, Any]]) -> dict:
    """Replace the full license tier list for a track. tiers may be empty
    to clear all existing tiers. Applies directly; recorded in Agent Actions.

    Idiom (v0.0.27+): the renderer organizes tiers as one row per
    deliverable — MP3, WAV, STEMS are fixed preset slots plus optional
    custom rows (e.g. MIDI). Prices are a dict from currency code to
    amount, supporting multiple currencies per tier (e.g.
    ``{"prices": {"CNY": 300, "USD": 50}}``). Prefer one deliverable per
    tier so the result lands cleanly in the preset slots."""
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

    # build_preview expects sample as list[str] (it slices to SAMPLE_CAP
    # entries) — a pre-joined string would be sliced to 5 CHARACTERS in the
    # agent_action_log / Agent Actions dashboard.
    if normalized:
        # Keep the overflow line inside build_preview's SAMPLE_CAP=5 window.
        shown = normalized[:5] if len(normalized) <= 5 else normalized[:4]
        sample_lines = [_format_tier(t) for t in shown]
        if len(normalized) > len(shown):
            sample_lines.append(f"… and {len(normalized) - len(shown)} more")
        headline = (
            f"Replace license tiers on \"{title}\" ({len(normalized)} tier"
            f"{'s' if len(normalized) != 1 else ''})"
        )
    else:
        sample_lines = ["(no tiers — track will have no license set)"]
        headline = f"Clear all license tiers on \"{title}\""

    payload = {
        "track_id": track_id,
        "tiers": normalized,
        "preview": build_preview(headline=headline, sample=sample_lines, warnings=[]),
    }
    return await submit_write("set_license_tiers", payload)
