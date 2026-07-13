from __future__ import annotations

import json

from beatos_platforms import load_vocab_map

from beatos_core.export.models import ExportField, ExportResult
from beatos_core.export.templates import render_template
from beatos_core.models.license_tier import LicenseTier
from beatos_core.models.track import Track

PLATFORM = "beatstars"
_GENRE_CAP = 3
_MOOD_CAP = 5


def _fmt_amount(amount: float) -> str:
    return f"{amount:g}"


def _price_line(tier: LicenseTier) -> str:
    label = tier.name or "+".join(tier.deliverables) or "Tier"
    usd = tier.prices.get("USD")
    if usd is not None:
        return f"{label}: ${_fmt_amount(usd)}"
    for code, amount in (tier.prices or {}).items():
        if amount is None:
            continue
        return f"{label}: {code} {_fmt_amount(amount)} (not exported — USD required)"
    return f"{label}: —"


def _price_tiers(tiers: list[LicenseTier]) -> list[dict]:
    """Map each tier onto a BeatStars license row (mp3|wav|stem) by deliverables.

    stem > wav > mp3 priority; USD-priced only (BeatStars sale price is USD);
    first tier per row key wins. share passes through (may be None)."""
    out: list[dict] = []
    seen: set[str] = set()
    for t in tiers:
        d = {x.lower() for x in (t.deliverables or [])}
        if "stem" in d:
            row = "stem"
        elif "wav" in d:
            row = "wav"
        elif "mp3" in d:
            row = "mp3"
        else:
            continue
        if row in seen:
            continue
        usd = t.prices.get("USD")
        if usd is None:
            continue
        seen.add(row)
        out.append({"row": row, "price": float(usd), "share": t.share})
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
    genre_map = load_vocab_map(PLATFORM, "genre")
    mood_map = load_vocab_map(PLATFORM, "mood")

    genres = [genre_map.get(g, g) for g in (track.genre or [])]
    genre_en = genres[0] if genres else ""

    free = templates.get("free_prefix", "[FREE] ") if track.is_free else ""

    def _tmpl(key: str) -> str:
        return render_template(
            templates.get(key, ""), track, prod=prod, year=year,
            # genre_zh kwarg holds the first mapped genre (English here, Chinese in netease)
            publish_date=publish_date, genre_zh=genre_en, free=free,
        )

    fields: list[ExportField] = []
    fields.append(ExportField(key="title", label="Title", value=_tmpl("beat_name")))
    fields.append(ExportField(key="description", label="Description", value=_tmpl("beat_description")))
    fields.append(ExportField(key="bpm", label="BPM",
                              value=str(track.bpm) if track.bpm is not None else ""))
    fields.append(ExportField(key="key", label="Key", value=track.key_signature or ""))

    genre_note = "BeatStars genre cap 3" if len(genres) > _GENRE_CAP else None
    fields.append(ExportField(key="genre", label="Genre",
                              value=" / ".join(genres), options=genres, note=genre_note))

    moods = [mood_map.get(m, m) for m in (track.mood or [])]
    mood_note = "BeatStars mood cap 5" if len(moods) > _MOOD_CAP else None
    fields.append(ExportField(key="mood", label="Mood", value=" / ".join(moods), note=mood_note))

    fields.append(ExportField(key="tags", label="Tags", value=" ".join(track.tags or [])))
    fields.append(ExportField(key="is_free", label="Free download",
                              value="1" if track.is_free else ""))
    # Track Type: the publish engine reads this to set the BeatStars Type select.
    # BeatOS only catalogs beats, so it's constant — but the key must EXIST or the
    # engine's f.get('trackType') is None and the select is left at its default
    # (audit P16: the field was never emitted).
    fields.append(ExportField(key="trackType", label="Track type", value="Beat"))
    fields.append(ExportField(key="visibility", label="Visibility", value="PUBLIC"))

    price_value = "\n".join(_price_line(t) for t in tiers)
    fields.append(ExportField(key="price", label="Price", value=price_value))
    exported_tiers = _price_tiers(tiers)
    fields.append(ExportField(key="price_tiers", label="Price tiers",
                              value=json.dumps(exported_tiers)))

    if tiers and not exported_tiers:
        fields.append(ExportField(
            key="price_note", label="Pricing warning",
            value=(
                f"{len(tiers)} license tier(s) have no USD price. BeatStars lists "
                "prices in USD, so these tiers were not exported — set USD prices "
                "or configure licenses manually on BeatStars."
            ),
        ))

    return ExportResult(platform=PLATFORM, fields=fields)
