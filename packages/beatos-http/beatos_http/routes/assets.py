"""/api/tracks/:id/assets and /api/assets/cover/:id routes."""
from __future__ import annotations

import asyncio
import pathlib

from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from beatos_core.assets.service import (
    attach_asset,
    detach_asset,
    get_asset,
    list_assets_for_track,
    relocate_asset,
)
from beatos_core.assets._constants import AUDIO_ROLES as _AUDIO_ROLES
from beatos_core.db import resolve_db_path
from beatos_core.models import Asset, AssetCreate
from beatos_http.wav_repair import repair_wav_to_file, wav_needs_repair

router = APIRouter(tags=["assets"])


def _wav_repair_dir() -> pathlib.Path:
    """Cache root for sanitized WAVs — a sibling of the sqlite DB (same convention
    the demo seed follows with `resolve_db_path().parent`), so it lives under the
    per-user BeatOS app-data dir and never invents a new root."""
    return resolve_db_path().parent / "wav-repair"


class RelocatePayload(BaseModel):
    new_path: str


@router.get("/api/tracks/{track_id}/assets", response_model=list[Asset])
async def list_for_track(track_id: int) -> list[Asset]:
    return await list_assets_for_track(track_id)


@router.post("/api/tracks/{track_id}/assets")
async def attach(
    track_id: int,
    payload: AssetCreate,
    replace: bool = Query(default=False),
):
    """Attach an asset. Returns 200 with Asset JSON."""
    try:
        asset = await attach_asset(
            track_id, role=payload.role, path=payload.path, replace=replace
        )
    except ValueError as e:
        msg = str(e)
        if "already has" in msg:
            raise HTTPException(status_code=409, detail=msg)
        raise HTTPException(status_code=400, detail=msg)
    return JSONResponse(status_code=200, content=asset.model_dump(mode="json"))


@router.delete("/api/tracks/{track_id}/assets/{asset_id}", status_code=204)
async def detach(track_id: int, asset_id: int) -> Response:  # noqa: ARG001
    await detach_asset(asset_id)
    return Response(status_code=204)


@router.post("/api/tracks/{track_id}/assets/{asset_id}/relocate", response_model=Asset)
async def relocate(track_id: int, asset_id: int, payload: RelocatePayload) -> Asset:  # noqa: ARG001
    try:
        return await relocate_asset(asset_id, new_path=payload.new_path)
    except ValueError as e:
        msg = str(e)
        if "sha256" in msg.lower():
            raise HTTPException(status_code=409, detail=msg)
        raise HTTPException(status_code=400, detail=msg)


@router.get("/api/assets/cover/{asset_id}")
async def cover_stream(asset_id: int) -> FileResponse:
    asset = await get_asset(asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found.")
    if asset.role != "cover":
        raise HTTPException(status_code=400, detail="Asset is not a cover.")
    p = pathlib.Path(asset.abs_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Cover file missing.")
    # Covers are immutable per asset id (replacing a cover mints a NEW id), so
    # let the browser cache them — otherwise every <img> remount re-fetches and
    # the cover visibly reloads. Mirrors the Electron beatos-asset:// proxy.
    return FileResponse(
        p,
        media_type=asset.mime_type or "image/jpeg",
        headers={"Cache-Control": "private, max-age=86400"},
    )


_FORMAT_MIME = {"wav": "audio/wav", "mp3": "audio/mpeg", "flac": "audio/flac"}


@router.get("/api/assets/audio/{asset_id}")
async def audio_stream(asset_id: int) -> Response:
    asset = await get_asset(asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found.")
    if asset.role not in _AUDIO_ROLES:
        raise HTTPException(status_code=400, detail="Asset is not audio.")
    p = pathlib.Path(asset.abs_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Audio file missing.")
    # Format (asset.format: wav/mp3/flac) is authoritative for content-type now;
    # fall back to the stored mime / extension only if format is somehow unset.
    media = (
        _FORMAT_MIME.get(asset.format)
        or asset.mime_type
        or ("audio/wav" if p.suffix.lower() == ".wav" else "audio/mpeg")
    )
    if media in ("audio/x-wav", "audio/vnd.wave"):
        media = "audio/wav"

    is_wav = asset.format == "wav" or p.suffix.lower() == ".wav"
    if is_wav:
        # Clean WAVs stay on a range-capable FileResponse (decodeAudioData and
        # the audio element handle them fine). Only DAW WAVs with extra RIFF
        # chunks / EXTENSIBLE fmt need sanitizing so Chromium can decode them —
        # matching what the Electron beatos-asset:// proxy did.
        def _scan() -> bool:
            with open(p, "rb") as f:
                return wav_needs_repair(f)

        if await asyncio.to_thread(_scan):
            # Repair once to a cache file, then serve it via FileResponse — this
            # restores Range support and keeps memory constant on every replay
            # (the old path read + copied + buffered the whole file per request,
            # ~3x RSS for a large WAV). Cache key = asset id + source size + mtime;
            # a changed source (new size/mtime) invalidates and re-repairs.
            cached = await asyncio.to_thread(_repaired_wav_path, asset.id, p)
            return FileResponse(cached, media_type="audio/wav")
        return FileResponse(p, media_type="audio/wav")

    return FileResponse(p, media_type=media)


def _repaired_wav_path(asset_id: int, src: pathlib.Path) -> pathlib.Path:
    """Return the path to the sanitized copy of `src`, repairing it into the cache
    on a miss / stale entry. Runs on a worker thread (blocking file I/O)."""
    st = src.stat()
    cache_dir = _wav_repair_dir()
    cache_dir.mkdir(parents=True, exist_ok=True)
    dst = cache_dir / f"{asset_id}-{st.st_size}-{int(st.st_mtime_ns)}.wav"
    if dst.exists():
        return dst
    # Repair to a temp sibling then atomically rename, so a concurrent reader
    # never observes a half-written cache file.
    tmp = dst.with_name(dst.name + ".tmp")
    repair_wav_to_file(src, tmp)
    tmp.replace(dst)
    return dst
