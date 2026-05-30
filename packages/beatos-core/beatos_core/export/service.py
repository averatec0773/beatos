from __future__ import annotations

from collections.abc import Callable

from beatos_core.export.models import ExportResult
from beatos_core.export.platforms import netease
from beatos_core.export.templates import DEFAULT_TEMPLATES
from beatos_core.licenses.service import list_tiers_for_track
from beatos_core.models.license_tier import LicenseTier
from beatos_core.models.track import Track
from beatos_core.tracks.service import get_track

_RENDERERS: dict[str, Callable[[Track, list[LicenseTier], dict[str, str]], ExportResult]] = {
    "netease": netease.render,
}


def available_platforms() -> list[str]:
    return sorted(_RENDERERS)


async def export_metadata(
    track_id: int,
    platform: str,
    templates: dict[str, str] | None = None,
) -> ExportResult:
    renderer = _RENDERERS.get(platform)
    if renderer is None:
        raise ValueError(f"Unknown export platform: {platform!r}")
    track = await get_track(track_id)
    if track is None:
        raise ValueError(f"Track {track_id} not found")
    tiers = await list_tiers_for_track(track_id)
    return renderer(track, tiers, templates if templates is not None else dict(DEFAULT_TEMPLATES))
