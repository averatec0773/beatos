"""Shared preview-block builder for batch write tools.

Every batch tool's payload carries a `preview` dict with this shape:
    {
        "headline": str,
        "sample": [str, ...]  (≤5 items),
        "warnings": [str, ...],
        "risk": "destructive"  (optional)
    }
"""
from __future__ import annotations

SAMPLE_CAP = 5


def build_preview(
    *,
    headline: str,
    sample: list[str],
    warnings: list[str] | None = None,
    risk: str | None = None,
) -> dict:
    block: dict = {
        "headline": headline,
        "sample": sample[:SAMPLE_CAP],
        "warnings": list(warnings) if warnings else [],
    }
    if risk:
        block["risk"] = risk
    return block


def format_track_sample(rows: list[tuple[int, str]]) -> list[str]:
    """rows: [(id, title), ...]  →  ['#42 Beat A', '#7 Beat B', ...]"""
    return [f"#{tid} {title or 'Untitled'}" for tid, title in rows]
