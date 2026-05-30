from __future__ import annotations

import datetime as _dt
from collections.abc import Callable

from beatos_core.app_settings.service import get_setting
from beatos_core.export.models import ExportResult
from beatos_core.export.platforms import netease
from beatos_core.export.templates import DEFAULT_TEMPLATES
from beatos_core.licenses.service import list_tiers_for_track
from beatos_core.models.license_tier import LicenseTier
from beatos_core.models.track import Track
from beatos_core.tracks.service import get_track

_TEMPLATES_KEY = "upload_templates"

# Renderer signature: (track, tiers, templates, *, year) -> ExportResult
_Renderer = Callable[..., ExportResult]
_RENDERERS: dict[str, _Renderer] = {
    "netease": netease.render,
}


def available_platforms() -> list[str]:
    return sorted(_RENDERERS)


def _current_year() -> int:
    return _dt.datetime.now().year


async def _resolve_templates() -> dict[str, str]:
    stored = await get_setting(_TEMPLATES_KEY)
    templates = dict(DEFAULT_TEMPLATES)
    if isinstance(stored, dict):
        for k, v in stored.items():
            if k in templates and isinstance(v, str):
                templates[k] = v
    return templates


async def export_metadata(track_id: int, platform: str) -> ExportResult:
    renderer = _RENDERERS.get(platform)
    if renderer is None:
        raise ValueError(f"Unknown export platform: {platform!r}")
    track = await get_track(track_id)
    if track is None:
        raise ValueError(f"Track {track_id} not found")
    tiers = await list_tiers_for_track(track_id)
    templates = await _resolve_templates()
    return renderer(track, tiers, templates, year=_current_year())
