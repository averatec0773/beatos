import asyncio

from fastapi import APIRouter, HTTPException

from beatos_core.assets.service import list_assets_for_track
from beatos_core.audio_analysis.models import AudioAnalysisResult
from beatos_core.audio_analysis.service import analyze_asset
from beatos_core.tracks.service import get_track

router = APIRouter(tags=["analysis"])

ANALYSIS_TIMEOUT_SECONDS = 60.0

AUDIO_PRIORITY = [
    "audio_tagged_wav",
    "audio_untagged_wav",
    "audio_tagged_mp3",
    "audio_untagged_mp3",
]


@router.post("/api/tracks/{track_id}/analyze", response_model=AudioAnalysisResult)
async def analyze_track_audio(track_id: int) -> AudioAnalysisResult:
    track = await get_track(track_id)
    if track is None:
        raise HTTPException(404, "Track not found")

    assets = await list_assets_for_track(track_id)
    available = {a.role: a for a in assets if not a.missing}

    chosen = None
    for role in AUDIO_PRIORITY:
        if role in available:
            chosen = available[role]
            break

    if chosen is None:
        raise HTTPException(404, "No audio asset to analyze")

    try:
        return await asyncio.wait_for(
            analyze_asset(chosen.id), timeout=ANALYSIS_TIMEOUT_SECONDS
        )
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    except asyncio.TimeoutError:
        raise HTTPException(504, "Analysis exceeded 60s timeout")
    except Exception as e:
        raise HTTPException(500, f"Analysis failed: {e}")
