"""License-tier Pydantic models.

A track owns 0..N tiers. Each tier represents one purchasable variant — e.g.
"MP3 lease" with prices in CNY and USD, or "WAV + stems exclusive" at a
single CNY price. `deliverables` is a freeform JSON array of short string
tokens; the renderer presents `mp3` / `wav` / `stem` as defaults but accepts
any custom token so platform adapters can map them to their own vocabularies.

v0.0.27: multi-currency. The old `price + currency` shape was a single price
in a single currency; replaced by `prices: dict[str, float]` so a producer
can quote ¥300 + $50 on the same tier without spinning up a duplicate row.
Empty `prices` map means the tier exists but is unpriced.
"""
from __future__ import annotations

import datetime as _dt
from typing import Optional

from pydantic import BaseModel, Field


class LicenseTier(BaseModel):
    id: int
    track_id: int
    position: int = 0
    name: str
    deliverables: list[str] = Field(default_factory=list)
    prices: dict[str, float] = Field(default_factory=dict)
    share: Optional[float] = None
    notes: Optional[str] = None
    created_at: _dt.datetime
    updated_at: _dt.datetime

    model_config = {"from_attributes": True}


class LicenseTierCreate(BaseModel):
    """Payload for POST /api/tracks/{id}/license_tiers. Position is auto-assigned
    to the end of the existing list when omitted."""

    model_config = {"extra": "forbid"}

    name: str = ""
    deliverables: list[str] = Field(default_factory=list)
    prices: dict[str, float] = Field(default_factory=dict)
    share: Optional[float] = None
    notes: Optional[str] = None


class LicenseTierUpdate(BaseModel):
    """Partial update payload. `prices` is whole-replace, not per-key merge —
    pass the complete map every time."""

    model_config = {"extra": "forbid"}

    name: Optional[str] = None
    deliverables: Optional[list[str]] = None
    prices: Optional[dict[str, float]] = None
    share: Optional[float] = None
    notes: Optional[str] = None
