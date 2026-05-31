from __future__ import annotations

import json
from typing import Any

FIELD_TO_COL: dict[str, str] = {
    "title": "title",
    "bpm": "bpm",
    "key": "key_signature",  # tool-facing name → DB column
    "description": "description",
    "producer": "producer",
    "genre": "genre",
    "mood": "mood",
    "is_free": "is_free",
}
SCALAR_FIELDS: set[str] = {"title", "bpm", "key", "description", "is_free"}
MULTI_FIELDS: set[str] = set(FIELD_TO_COL) - SCALAR_FIELDS


def apply_array_patch(current_json: str | None, spec: Any) -> list[str]:
    """spec is either a list (replace) or {add?, remove?}."""
    if isinstance(spec, list):
        seen: set[str] = set()
        out: list[str] = []
        for v in spec:
            if v not in seen:
                out.append(v)
                seen.add(v)
        return out
    cur: list[str] = json.loads(current_json) if current_json else []
    add = list(spec.get("add", []) or [])
    remove = set(spec.get("remove", []) or [])
    out2: list[str] = []
    seen2: set[str] = set()
    for v in cur:
        if v in remove or v in seen2:
            continue
        out2.append(v)
        seen2.add(v)
    for v in add:
        if v not in seen2:
            out2.append(v)
            seen2.add(v)
    return out2
