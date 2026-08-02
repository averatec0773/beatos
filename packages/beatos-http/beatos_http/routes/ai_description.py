"""/api/ai/track_description — AI-generated track description proposals (P4).

Mirrors the /api/ai route family exactly: token-gated because it spends the
user's own AI-provider credits (audit B5), 404 for an unknown track, 409 when no
provider is configured, 502 for a provider failure (status only — the API key is
never returned or logged).

This route only PROPOSES. It never writes `track.description`; the renderer shows
the value for review and saves it through the normal track update path.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from beatos_http.ai import open_field
from beatos_http.ai.open_field import DescriptionProposal
from beatos_http.api_auth import require_api_token

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["ai"])


class DescriptionRequest(BaseModel):
    model_config = {"extra": "forbid"}

    track_id: int
    platform: str | None = None
    extra_context: str | None = None


@router.post("/track_description", response_model=DescriptionProposal)
async def track_description(
    body: DescriptionRequest,
    _gate: None = Depends(require_api_token),
) -> DescriptionProposal:
    # Spends the user's own AI-provider credits → token-gated (audit B5), same as
    # suggest-tags / batch / chat. Depends (not an explicit Request param) so tests
    # can keep calling the handler directly.
    try:
        return await open_field.generate_track_description(
            body.track_id,
            platform=body.platform,
            extra_context=body.extra_context,
        )
    except open_field.TrackNotFound:
        raise HTTPException(404, "Track not found") from None
    except open_field.ProviderNotConfigured:
        raise HTTPException(
            409, "AI is not enabled. Set it up in Settings → AI Assist."
        ) from None
    except RuntimeError as e:
        # The provider raises clean, key-free messages (status only).
        raise HTTPException(502, str(e)) from None
    except Exception as e:
        # Never log the key or full error; the type name is enough to diagnose.
        log.warning("track_description failed: %s", type(e).__name__)
        raise HTTPException(500, "AI description generation failed") from None
