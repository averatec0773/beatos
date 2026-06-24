"""POST /api/tracks/{id}/tagged-mp3 — download an ID3-tagged copy of an MP3 (EPIC-D13-2).

Validates the chosen asset is an MP3 belonging to the track, writes ID3 frames from
the catalog onto an in-memory copy (never touching the original file), and streams it
back as a download. Works for desktop and web (plain HTTP). FREE (no Pro gating).
"""
from __future__ import annotations

import pathlib
import urllib.parse
from typing import Optional

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from beatos_core.assets.service import get_asset
from beatos_core.tracks.service import get_track

from beatos_http.id3_export import write_id3_tags

track_router = APIRouter(tags=["export"])

# Cover art is embedded as an APIC frame; skip an oversized image rather than bloat
# the file unboundedly.
_MAX_COVER_BYTES = 5 * 1024 * 1024


class _TaggedMp3Request(BaseModel):
    asset_id: int


async def _load_cover(track) -> Optional[bytes]:
    if track.cover_asset_id is None:
        return None
    asset = await get_asset(track.cover_asset_id)
    if asset is None or not asset.abs_path:
        return None
    try:
        data = pathlib.Path(asset.abs_path).read_bytes()
    except OSError:
        return None
    return data if 0 < len(data) <= _MAX_COVER_BYTES else None


def _content_disposition(track_title: str) -> str:
    """attachment header with an ASCII fallback + UTF-8 name (RFC 5987)."""
    nice = f"{track_title}.mp3".strip()
    quoted = urllib.parse.quote(nice)
    return f"attachment; filename=\"track.mp3\"; filename*=UTF-8''{quoted}"


@track_router.post("/api/tracks/{track_id}/tagged-mp3")
async def tagged_mp3(track_id: int, req: _TaggedMp3Request) -> Response:
    track = await get_track(track_id)
    if track is None:
        raise HTTPException(404, "Track not found")
    asset = await get_asset(req.asset_id)
    if asset is None or asset.track_id != track_id:
        raise HTTPException(404, "Audio asset not found for this track")
    if asset.format != "mp3":
        raise HTTPException(400, "ID3 export requires an MP3 asset")
    try:
        source = pathlib.Path(asset.abs_path).read_bytes()
    except OSError:
        raise HTTPException(404, "Audio file is missing on disk")

    cover = await _load_cover(track)
    tagged = write_id3_tags(source_mp3=source, track=track, cover=cover)
    return Response(
        content=tagged,
        media_type="audio/mpeg",
        headers={"Content-Disposition": _content_disposition(track.title)},
    )
