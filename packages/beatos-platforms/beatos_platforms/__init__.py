"""BeatOS per-platform vocabulary maps (data package)."""
from __future__ import annotations

import json
from importlib.resources import files


def load_vocab_map(platform: str, kind: str) -> dict[str, str]:
    """Return the en -> platform-label map for a platform field.

    kind is "genre" or "mood". Missing file -> {} (identity fallback at callsite).
    """
    resource = files("beatos_platforms").joinpath("data", platform, f"{kind}-map.json")
    if not resource.is_file():
        return {}
    return json.loads(resource.read_text("utf-8"))
