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


def load_form_map(platform: str) -> dict:
    """Return the upload-form selector map for a platform.

    Missing file -> {} (callsite decides 404). Shape:
    {"match": [...], "fields": {key: {"selector": str, "type": str}}}.
    """
    resource = files("beatos_platforms").joinpath("data", platform, "upload-form.json")
    if not resource.is_file():
        return {}
    return json.loads(resource.read_text("utf-8"))
