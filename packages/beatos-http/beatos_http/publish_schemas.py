"""Public request schema for the publish route — defined here so the route can
exist in the free build without importing the private engine's models."""
from __future__ import annotations

import datetime as _dt
from typing import Literal, Optional

from pydantic import BaseModel, Field


class PublishRequestBody(BaseModel):
    track_id: int
    platform: str
    account: str = "default"
    # "engine" drives the Pro patchright browser (default, unchanged path);
    # "extension" stages a ticket for the browser extension to claim.
    mode: Literal["engine", "extension"] = "engine"
    audio_asset_id: Optional[int] = None
    video_asset_id: Optional[int] = None
    cover_asset_id: Optional[int] = None
    deliverable_wav_asset_id: Optional[int] = None
    deliverable_stems_asset_id: Optional[int] = None
    # DOUYIN-ONLY, and not yet surfaced in the UI: flows through to the engine's
    # 定时发布 driver. netease/beatstars publish() ignore it (no scheduled-release
    # gate), so setting it for those platforms is a silent no-op — don't expose a
    # schedule control for them (audit P16).
    schedule: Optional[_dt.datetime] = None
    dry_run: bool = False


class TicketReportBody(BaseModel):
    """Extension → sidecar progress report for a claimed ticket. `reports` is
    the cumulative field-report list (offeros protocol: re-sent in full, merged
    by (page, field_id) server-side)."""
    stage: Optional[str] = None
    message: str = ""
    reports: list[dict] = Field(default_factory=list)


class PublishLoginBody(BaseModel):
    platform: str
    account: str | None = None


class PublishValidateBody(BaseModel):
    # Optional subset of platforms to (re)validate. None / empty → all platforms.
    # The renderer sends only the platforms whose expensive check is stale, so a
    # single stale platform doesn't re-launch a browser for the still-fresh ones.
    platforms: Optional[list[str]] = None
