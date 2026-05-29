from __future__ import annotations

from beatos_platforms import load_vocab_map

from beatos_core.export.models import ExportField, ExportResult
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


def render(track: Track, tiers: list[LicenseTier]) -> ExportResult:
    genre_map = load_vocab_map(PLATFORM, "genre")
    mood_map = load_vocab_map(PLATFORM, "mood")

    fields: list[ExportField] = []
    fields.append(ExportField(key="title", label="标题", value=track.title or ""))

    genres = [genre_map.get(g, g) for g in (track.genre or [])]
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
    fields.append(ExportField(key="description", label="简介", value=track.description or ""))
    fields.append(ExportField(key="tags", label="标签", value=" ".join(track.tags or [])))

    price_value = "\n".join(_price_line(t) for t in tiers)
    fields.append(ExportField(key="price", label="价格", value=price_value))

    return ExportResult(platform=PLATFORM, fields=fields)
