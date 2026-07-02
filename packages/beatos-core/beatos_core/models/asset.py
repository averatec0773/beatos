"""Asset Pydantic model — a file attached to a track."""
from __future__ import annotations

import datetime as _dt
from typing import Optional, Literal

from pydantic import BaseModel, Field

AssetRole = Literal[
    "audio_tagged",
    "audio_untagged",
    "loop",
    "stems",
    "cover",
    "promo_video_vertical",
    "promo_video_landscape",
    "promo_video_square",
]
AssetMode = Literal["linked", "managed"]


class Asset(BaseModel):
    """A file attached to a track via a role.

    `linked`: BeatOS stores `abs_path` only, never copies the file.
    `managed`: BeatOS copies the file into its own managed storage area.
    """

    id: int
    track_id: int
    role: str
    mode: AssetMode = "linked"
    abs_path: str = Field(description="Absolute path on disk; always set.")
    rel_path: Optional[str] = Field(
        default=None,
        description="Relative path when mode='managed'.",
    )
    sha256: Optional[str] = Field(default=None, description="Content hash for recovery.")
    size_bytes: Optional[int] = None
    mime_type: Optional[str] = None
    format: str = Field(
        default="",
        description="Normalized audio format: 'wav'|'mp3'|'flac' for audio roles; '' otherwise.",
    )
    missing: bool = False
    created_at: _dt.datetime

    model_config = {"from_attributes": True}


class AssetCreate(BaseModel):
    """Body for POST /api/tracks/:id/assets."""

    role: AssetRole
    path: str = Field(description="Absolute path the user picked.")
