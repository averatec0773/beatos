"""Track Pydantic model."""
from __future__ import annotations

import datetime as _dt
from typing import Optional

from pydantic import BaseModel, Field


class Track(BaseModel):
    id: int
    title: str
    bpm: Optional[int] = None
    key_signature: Optional[str] = None
    genre: Optional[str] = None
    mood: Optional[str] = None
    tags: Optional[list[str]] = None
    description: Optional[str] = Field(default=None, description="User-authored — sacred.")
    description_draft: Optional[str] = Field(default=None, description="AI-generated draft.")
    license_type: str = "lease_basic"
    price: Optional[float] = None
    cover_asset_id: Optional[int] = Field(
        default=None,
        description="Id of the cover asset (asset.role='cover'); NULL if none.",
    )
    created_at: _dt.datetime
    updated_at: _dt.datetime

    model_config = {"from_attributes": True}


class TrackCreate(BaseModel):
    title: str


class TrackUpdate(BaseModel):
    """Partial track update payload. description_draft NOT exposed (sacred).

    `extra='forbid'` makes the HTTP layer return 422 if a client sends
    `description_draft` or any other unknown field — surfacing protocol
    errors loudly rather than silently dropping data.
    """

    model_config = {"extra": "forbid"}

    title: Optional[str] = None
    bpm: Optional[int] = None
    key_signature: Optional[str] = None
    genre: Optional[str] = None
    mood: Optional[str] = None
    tags: Optional[list[str]] = None
    description: Optional[str] = None
    license_type: Optional[str] = None
    price: Optional[float] = None
