"""License-tier Pydantic models.

A track owns 0..N tiers. Each tier represents one purchasable variant — e.g.
"MP3 lease" at ¥50, "WAV + stems exclusive" at ¥3000. `deliverables` is a
freeform JSON array of short string tokens; the renderer presents `mp3` /
`wav` / `stem` as defaults but accepts any custom token so platform adapters
can map them to their own vocabularies.
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
    price: Optional[float] = None
    currency: str = "CNY"
    notes: Optional[str] = None
    created_at: _dt.datetime
    updated_at: _dt.datetime

    model_config = {"from_attributes": True}


class LicenseTierCreate(BaseModel):
    """Payload for POST /api/tracks/{id}/license_tiers. Position is auto-assigned
    to the end of the existing list when omitted."""

    model_config = {"extra": "forbid"}

    name: str
    deliverables: list[str] = Field(default_factory=list)
    price: Optional[float] = None
    currency: str = "CNY"
    notes: Optional[str] = None


class LicenseTierUpdate(BaseModel):
    """Partial update payload."""

    model_config = {"extra": "forbid"}

    name: Optional[str] = None
    deliverables: Optional[list[str]] = None
    price: Optional[float] = None
    currency: Optional[str] = None
    notes: Optional[str] = None
