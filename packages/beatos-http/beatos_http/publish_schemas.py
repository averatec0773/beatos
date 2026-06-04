"""Public request schema for the publish route — defined here so the route can
exist in the free build without importing the private engine's models."""
from __future__ import annotations

import datetime as _dt
from typing import Optional

from pydantic import BaseModel


class PublishRequestBody(BaseModel):
    track_id: int
    platform: str
    account: str = "default"
    audio_asset_id: int
    cover_asset_id: Optional[int] = None
    deliverable_wav_asset_id: Optional[int] = None
    deliverable_stems_asset_id: Optional[int] = None
    schedule: Optional[_dt.datetime] = None
    dry_run: bool = False
    auto_advance: bool = False


class PublishLoginBody(BaseModel):
    platform: str
    account: str | None = None
