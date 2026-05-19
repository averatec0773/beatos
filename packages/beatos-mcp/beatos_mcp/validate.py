"""Shared input validation helpers for MCP write tools.

MAX_IDS is the cap for ids/track_ids lists across batch tools (trash, restore,
purge, update_tracks, add/remove_tracks_to_list, reorder_list, draft_descriptions).
create_tracks has its own MAX_ITEMS=100 since each item is a record."""
from __future__ import annotations

MAX_IDS = 500


def validate_ids(ids: list[int], *, label: str = "ids") -> None:
    """Validate a batch-tool ids list: non-empty, ≤MAX_IDS, all ints."""
    if not isinstance(ids, list) or not ids:
        raise ValueError(f"{label} must be a non-empty list of integers")
    if len(ids) > MAX_IDS:
        raise ValueError(f"{label} list too large: max {MAX_IDS}")
    if not all(isinstance(x, int) for x in ids):
        raise ValueError(f"{label} must contain only integers")
