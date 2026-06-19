"""Shared SQL WHERE-clause builder for track filters.

Single source of truth for how track filters (producer/genre/mood/key, bpm
range, has-audio, free text) become SQL, used by BOTH the core `list_tracks` /
`tracks_in_list` (HTTP) and the MCP `list_tracks` tool — so agent search and
in-app search stay identical (the regression class that the v0.0.28/30 search
work kept hitting when these were hand-copied).

Pure logic: builds SQL strings + bound params, no DB / IO / web deps (rule #2).
Callers own the `track.deleted_at IS NULL` predicate and the final join.
"""
from __future__ import annotations

from beatos_core.assets._constants import AUDIO_ROLES
from beatos_core.tracks.query_parser import escape_like

# Fields stored as JSON-array TEXT (one track → many values), matched with a
# json_each EXISTS subquery rather than a scalar `IN`.
MULTI_VALUE_FIELDS = frozenset({"producer", "genre", "mood"})

# Free-text search columns. Two known limitations:
#  - SQLite LIKE is case-insensitive for ASCII only; non-ASCII matches case-sensitively.
#  - producer/genre/mood are JSON-array TEXT, so LIKE matches the raw JSON
#    substring (e.g. "rap" matches ["trap"]). Fine for discovery-style free
#    text; precise per-value matching uses the structured filters instead.
TEXT_SEARCH_COLS = (
    "track.title", "track.description", "track.tags",
    "track.producer", "track.genre", "track.mood", "track.key_signature",
)

# Derived from the canonical AUDIO_ROLES set (single source of truth) so a new
# audio role (e.g. 'loop' in v0.0.46) flows into has_audio filtering with no edit
# here. Sorted for a deterministic SQL string.
_AUDIO_ROLES_SQL = "(" + ",".join(f"'{r}'" for r in sorted(AUDIO_ROLES)) + ")"


def build_filter_clauses(
    *,
    producers: list[str] | None = None,
    genres: list[str] | None = None,
    moods: list[str] | None = None,
    keys: list[str] | None = None,
    producers_like: list[str] | None = None,
    genres_like: list[str] | None = None,
    moods_like: list[str] | None = None,
    keys_like: list[str] | None = None,
    bpm_min: float | None = None,
    bpm_max: float | None = None,
    has_audio: bool | None = None,
    text: list[str] | None = None,
) -> tuple[list[str], list]:
    """Return (clauses, params) for the given filters — WITHOUT the deleted_at
    predicate. Callers AND these together with their own scoping clauses.

    Two flavours of the producer/genre/mood/key filters:
      * exact (`producers`/`genres`/`moods`/`keys`): case-sensitive equality —
        used by the structured `list_tracks` filter params, where the agent has
        already discovered the exact value via list_distinct_values.
      * substring (`*_like`): case-insensitive LIKE — used by the search-box
        field tokens (`genre:Memphis` matches "Memphis Rap", `key:F` matches
        "F minor"), mirroring the in-app search box. Values within one field are
        OR-ed; the field as a whole is AND-ed with the rest of the query.
    """
    clauses: list[str] = []
    params: list = []
    for field, values in [
        ("producer", producers), ("genre", genres), ("mood", moods), ("key_signature", keys),
    ]:
        if values:
            placeholders = ", ".join("?" for _ in values)
            if field in MULTI_VALUE_FIELDS:
                clauses.append(
                    f"EXISTS (SELECT 1 FROM json_each(track.{field}) je "
                    f"WHERE je.value IN ({placeholders}))"
                )
            else:
                clauses.append(f"{field} IN ({placeholders})")
            params.extend(values)
    for field, values in [
        ("producer", producers_like), ("genre", genres_like),
        ("mood", moods_like), ("key_signature", keys_like),
    ]:
        if values:
            ors: list[str] = []
            for v in values:
                like = f"%{escape_like(v)}%"
                if field in MULTI_VALUE_FIELDS:
                    ors.append(
                        f"EXISTS (SELECT 1 FROM json_each(track.{field}) je "
                        f"WHERE je.value LIKE ? ESCAPE '\\')"
                    )
                else:
                    ors.append(f"{field} LIKE ? ESCAPE '\\'")
                params.append(like)
            clauses.append("(" + " OR ".join(ors) + ")")
    if bpm_min is not None:
        clauses.append("bpm >= ?")
        params.append(bpm_min)
    if bpm_max is not None:
        clauses.append("bpm <= ?")
        params.append(bpm_max)
    if has_audio is True:
        clauses.append(
            "EXISTS (SELECT 1 FROM asset ax WHERE ax.track_id = track.id "
            f"AND ax.missing = 0 AND ax.role IN {_AUDIO_ROLES_SQL})"
        )
    elif has_audio is False:
        clauses.append(
            "NOT EXISTS (SELECT 1 FROM asset ax WHERE ax.track_id = track.id "
            f"AND ax.missing = 0 AND ax.role IN {_AUDIO_ROLES_SQL})"
        )
    if text:
        for term in text:
            like = f"%{escape_like(term)}%"
            ors = " OR ".join(f"{col} LIKE ? ESCAPE '\\'" for col in TEXT_SEARCH_COLS)
            clauses.append(f"({ors})")
            params.extend([like] * len(TEXT_SEARCH_COLS))
    return clauses, params
