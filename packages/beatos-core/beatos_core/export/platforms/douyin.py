"""Douyin promo-video metadata renderer.

Pure: no DB/network I/O. Produces an ExportResult whose fields the publish engine
types into the creator upload page. Topics are emitted as a JSON list so the
engine can register each #topic through Douyin's autocomplete (one tag at a time).
"""
from __future__ import annotations

import json

from beatos_core.export.models import ExportField, ExportResult
from beatos_core.export.templates import render_template
from beatos_core.models.license_tier import LicenseTier
from beatos_core.models.track import Track

PLATFORM = "douyin"
_TITLE_MAX = 30


def _topics(track: Track, genre: str, house: list[str]) -> list[str]:
    """First genre + track tags + house tags; '#' stripped, blanks dropped,
    order-preserving dedupe."""
    raw: list[str] = []
    if genre:
        raw.append(genre)
    raw.extend(track.tags or [])
    raw.extend(house)
    seen: set[str] = set()
    out: list[str] = []
    for item in raw:
        tag = item.strip().lstrip("#").strip()
        if tag and tag not in seen:
            seen.add(tag)
            out.append(tag)
    return out


def render(
    track: Track,
    tiers: list[LicenseTier],
    templates: dict[str, str],
    *,
    prod: str = "",
    year: int = 0,
    publish_date: str = "",
) -> ExportResult:
    # Douyin uses the raw first genre (e.g. "Trap型beat" is idiomatic on CN beat
    # Douyin) — no cross-platform vocab map dependency.
    genres = track.genre or []
    genre = genres[0] if genres else ""
    free = templates.get("free_prefix", "[FREE] ") if track.is_free else ""

    def _tmpl(key: str) -> str:
        return render_template(
            templates.get(key, ""), track,
            prod=prod, year=year, publish_date=publish_date, genre_zh=genre, free=free,
        )

    title = _tmpl("douyin_title")[:_TITLE_MAX]
    caption = _tmpl("douyin_caption")
    house = _tmpl("douyin_topics").split()
    topics = _topics(track, genre, house)

    fields = [
        ExportField(key="title", label="标题", value=title),
        ExportField(key="caption", label="文案", value=caption),
        ExportField(key="topics", label="话题", value=json.dumps(topics, ensure_ascii=False)),
        ExportField(key="is_free", label="免费", value="1" if track.is_free else ""),
    ]
    return ExportResult(platform=PLATFORM, fields=fields)
