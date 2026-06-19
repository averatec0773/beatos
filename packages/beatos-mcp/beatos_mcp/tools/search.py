"""search_tracks: query-string search sharing beatos-core's parse_query."""
from __future__ import annotations

from beatos_core.tracks.query_parser import parse_query
from beatos_mcp.tools.tracks import list_tracks


async def search_tracks(*, query: str, limit: int = 50, offset: int = 0) -> dict:
    spec = parse_query(query)
    # tag: tokens have no dedicated filter column -> fold into free text,
    # IDENTICAL to the HTTP route (Task 4) so agent search == human search.
    text = (spec.text + spec.tags) or None
    # Field tokens (genre:/mood:/producer:/key:) substring-match the in-app
    # search box: `genre:Memphis` finds "Memphis Rap", `key:F` finds "F minor".
    # They go through the `*_like` (LIKE) builder, NOT the exact `producers=`
    # list_tracks filter params.
    return await list_tracks(
        producers_like=spec.producers or None,
        genres_like=spec.genres or None,
        moods_like=spec.moods or None,
        keys_like=spec.keys or None,
        bpm_min=spec.bpm_min,
        bpm_max=spec.bpm_max,
        has_audio=spec.has_audio,
        text=text,
        limit=limit,
        offset=offset,
    )
