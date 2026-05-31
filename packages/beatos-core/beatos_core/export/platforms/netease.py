from __future__ import annotations

import json

from beatos_platforms import load_vocab_map

from beatos_core.export.models import ExportField, ExportResult
from beatos_core.export.templates import render_template
from beatos_core.models.license_tier import LicenseTier
from beatos_core.models.track import Track

PLATFORM = "netease"
_MOOD_CAP = 3


def _fmt_amount(amount: float) -> str:
    return f"{amount:g}"


def _price_line(tier: LicenseTier) -> str:
    label = tier.name or "+".join(tier.deliverables) or "Tier"
    if not tier.prices:
        return f"{label}: —"
    parts: list[str] = []
    if "CNY" in tier.prices:
        parts.append(f"¥{_fmt_amount(tier.prices['CNY'])}")
    for cur, amt in tier.prices.items():
        if cur == "CNY":
            continue
        parts.append(f"{cur} {_fmt_amount(amt)}")
    return f"{label}: {' / '.join(parts)}"


def _price_tiers(tiers: list[LicenseTier]) -> list[dict]:
    """Map each tier onto a NetEase 租赁授权 row key by deliverables.

    stem > wav > mp3 priority; only-mp3 → "mp3", has-wav-no-stem → "wav",
    has-stem → "stem". CNY-priced only (NetEase 售价 is RMB); first tier per
    row key wins. share passes through (may be None)."""
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
        cny = t.prices.get("CNY")
        if cny is None:
            continue
        seen.add(row)
        out.append({"row": row, "price": float(cny), "share": t.share})
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
    # beat_name's {genre} token always uses the FIRST genre, even when the genre
    # field below downgrades to options-with-note (multi-genre → manual pick). A
    # Beat name needs one concrete genre; the producer may pick a different one
    # in the selector — that mismatch is intentional, not a bug.
    genre_zh = genres[0] if genres else ""

    free = templates.get("free_prefix", "[FREE] ") if track.is_free else ""

    def _tmpl(key: str) -> str:
        return render_template(
            templates.get(key, ""), track, prod=prod, year=year, publish_date=publish_date, genre_zh=genre_zh, free=free
        )

    fields: list[ExportField] = []
    fields.append(ExportField(key="album_name", label="专辑名", value=_tmpl("album_name")))
    fields.append(ExportField(key="album_description", label="专辑描述", value=_tmpl("album_description")))
    fields.append(ExportField(key="title", label="标题", value=_tmpl("beat_name")))

    if len(genres) <= 1:
        fields.append(ExportField(key="genre", label="流派", value=genres[0] if genres else ""))
    else:
        fields.append(
            ExportField(key="genre", label="流派", value="", options=genres,
                        note="网易云单选，请选其一")
        )

    moods = [mood_map.get(m, m) for m in (track.mood or [])]
    mood_note = "情绪上限 3，已超出" if len(moods) > _MOOD_CAP else None
    fields.append(ExportField(key="mood", label="情绪", value=" / ".join(moods), note=mood_note))

    fields.append(ExportField(key="bpm", label="BPM",
                              value=str(track.bpm) if track.bpm is not None else ""))
    fields.append(ExportField(key="key", label="调性", value=track.key_signature or ""))
    fields.append(ExportField(key="description", label="简介", value=_tmpl("beat_description")))
    fields.append(ExportField(key="tags", label="标签", value=" ".join(track.tags or [])))
    fields.append(ExportField(key="is_free", label="免费使用",
                              value="1" if track.is_free else ""))

    price_value = "\n".join(_price_line(t) for t in tiers)
    fields.append(ExportField(key="price", label="价格", value=price_value))
    fields.append(ExportField(key="price_tiers", label="价格档位",
                              value=json.dumps(_price_tiers(tiers))))

    return ExportResult(platform=PLATFORM, fields=fields)
