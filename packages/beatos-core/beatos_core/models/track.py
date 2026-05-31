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
    genre: Optional[list[str]] = None
    mood: Optional[list[str]] = None
    tags: Optional[list[str]] = None
    description: Optional[str] = None
    producer: Optional[list[str]] = None
    is_free: bool = False
    cover_asset_id: Optional[int] = Field(
        default=None,
        description="Id of the cover asset (asset.role='cover'); NULL if none.",
    )
    has_audio: bool = Field(
        default=False,
        description="True if track has at least one non-missing audio asset. Derived.",
    )
    created_at: _dt.datetime
    updated_at: _dt.datetime
    deleted_at: Optional[_dt.datetime] = None

    model_config = {"from_attributes": True}


class TrackCreate(BaseModel):
    title: str


class TrackUpdate(BaseModel):
    """Partial track update payload.

    `extra='forbid'` makes the HTTP layer return 422 if a client sends
    an unknown field — surfacing protocol errors loudly rather than
    silently dropping data.
    """

    model_config = {"extra": "forbid"}

    title: Optional[str] = None
    bpm: Optional[int] = None
    key_signature: Optional[str] = None
    genre: Optional[list[str]] = None
    mood: Optional[list[str]] = None
    tags: Optional[list[str]] = None
    description: Optional[str] = None
    producer: Optional[list[str]] = None
