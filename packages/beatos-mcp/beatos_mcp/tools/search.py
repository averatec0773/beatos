"""search_tracks: query-string search sharing beatos-core's parse_query."""
from __future__ import annotations

from beatos_core.tracks.query_parser import parse_query
from beatos_mcp.tools.tracks import list_tracks


async def search_tracks(*, query: str, limit: int = 50, offset: int = 0) -> dict:
    spec = parse_query(query)
    # tag: tokens have no dedicated filter column -> fold into free text,
    # IDENTICAL to the HTTP route (Task 4) so agent search == human search.
    text = (spec.text + spec.tags) or None
    return await list_tracks(
        producers=spec.producers or None,
        genres=spec.genres or None,
        moods=spec.moods or None,
        keys=spec.keys or None,
        bpm_min=spec.bpm_min,
        bpm_max=spec.bpm_max,
        has_audio=spec.has_audio,
        text=text,
        limit=limit,
        offset=offset,
    )
