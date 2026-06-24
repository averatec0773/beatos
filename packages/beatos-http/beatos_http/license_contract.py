"""License-contract PDF rendering (EPIC-D14).

Pure renderer: (track, tier, buyer, ...) -> one-page PDF bytes. No DB / network —
the caller (the HTTP route) fetches the Track + LicenseTier and passes them in,
which keeps this unit-testable in isolation. reportlab is pure-Python (no system
deps), so it bundles with the PyInstaller sidecar (D1).

Lives in beatos-http (not beatos-core) on purpose: it has a single consumer (the
HTTP route) and pulls reportlab, so keeping it out of the dependency-light core
package respects the "beatos-core = business logic, no heavy facade deps" spirit.

Bilingual (en + zh). Chinese is rendered with reportlab's built-in STSong-Light
CID font, so it works without shipping a font file. The output is a TEMPLATE, not
legal advice — it carries a disclaimer.
"""
from __future__ import annotations

import datetime as _dt
import io
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

from beatos_core.models.license_tier import LicenseTier
from beatos_core.models.track import Track

_CJK_FONT = "STSong-Light"
_cjk_registered = False


def _ensure_cjk_font() -> None:
    """Register reportlab's bundled Adobe CJK font once (no external file)."""
    global _cjk_registered
    if not _cjk_registered:
        pdfmetrics.registerFont(UnicodeCIDFont(_CJK_FONT))
        _cjk_registered = True


def _font(lang: str, *, bold: bool = False) -> str:
    if lang == "zh":
        _ensure_cjk_font()
        return _CJK_FONT  # STSong-Light has no separate bold weight; reuse it.
    return "Helvetica-Bold" if bold else "Helvetica"


# Document content (data values, not UI chrome) — rule 15 exempts these from i18next.
_T: dict[str, dict] = {
    "en": {
        "title": "Beat License Agreement",
        "type_exclusive": "Exclusive license",
        "type_nonexclusive": "Non-exclusive license",
        "beat": "Beat",
        "licensor": "Licensor (Producer)",
        "licensee": "Licensee (Buyer)",
        "tier": "License tier",
        "deliverables": "Deliverables",
        "price": "Price",
        "date": "Date",
        "terms_heading": "Terms",
        "terms_nonexclusive": [
            "The Licensor grants the Licensee a non-exclusive, non-transferable license to use the beat named above, in the delivered formats.",
            "The Licensor retains full ownership and may license the same beat to other parties.",
            "Credit to the Licensor (\"prod. by ...\") is required on all releases unless otherwise agreed in writing.",
        ],
        "terms_exclusive": [
            "The Licensor grants the Licensee an exclusive license to the beat named above, in the delivered formats.",
            "Upon full payment, the Licensor will not license this beat to any other party; the Licensor retains underlying authorship.",
            "Credit to the Licensor (\"prod. by ...\") is required on all releases unless otherwise agreed in writing.",
        ],
        "signatures": "Licensor signature: ____________________     Licensee signature: ____________________",
        "disclaimer": "This document is a template provided for convenience and is not legal advice. Confirm the terms with a qualified professional before relying on it.",
    },
    "zh": {
        "title": "Beat 授权协议",
        "type_exclusive": "独占授权",
        "type_nonexclusive": "非独占授权",
        "beat": "Beat",
        "licensor": "授权方(制作人)",
        "licensee": "被授权方(买家)",
        "tier": "授权档位",
        "deliverables": "交付内容",
        "price": "价格",
        "date": "日期",
        "terms_heading": "条款",
        "terms_nonexclusive": [
            "授权方向被授权方授予对上述 Beat 的非独占、不可转让使用权,范围为已交付的格式。",
            "授权方保留全部所有权,并可将同一 Beat 授权给其他方。",
            "除非另有书面约定,所有发行须署名授权方(\"prod. by ...\")。",
        ],
        "terms_exclusive": [
            "授权方向被授权方授予对上述 Beat 的独占使用权,范围为已交付的格式。",
            "在全额付款后,授权方不再将该 Beat 授权给任何其他方;授权方保留底层著作权。",
            "除非另有书面约定,所有发行须署名授权方(\"prod. by ...\")。",
        ],
        "signatures": "授权方签字:____________________     被授权方签字:____________________",
        "disclaimer": "本文件为便利提供的模板,不构成法律意见。在依赖之前请咨询专业人士确认条款。",
    },
}


def _esc(s: Optional[str]) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _format_prices(prices: dict[str, float]) -> str:
    return ", ".join(f"{cur} {amt:g}" for cur, amt in prices.items()) if prices else ""


def render_license_pdf(
    *,
    track: Track,
    tier: LicenseTier,
    buyer: str,
    exclusive: bool = False,
    price: Optional[str] = None,
    date: Optional[str] = None,
    lang: str = "en",
) -> bytes:
    """Render a one-page license PDF and return its bytes.

    `price` overrides the tier's own prices when given; `date` defaults to today.
    `lang` is "en" or "zh" (anything else falls back to English).
    """
    t = _T.get(lang, _T["en"])
    font = _font(lang)
    font_bold = _font(lang, bold=True)
    wrap = "CJK" if lang == "zh" else None

    producer = ", ".join(track.producer) if track.producer else ""
    deliverables = ", ".join(tier.deliverables) if tier.deliverables else ""
    price_str = price if price is not None else _format_prices(tier.prices)
    date_str = date if date is not None else _dt.date.today().isoformat()

    h1 = ParagraphStyle("h1", fontName=font_bold, fontSize=18, leading=23, spaceAfter=4, wordWrap=wrap)
    h2 = ParagraphStyle("h2", fontName=font_bold, fontSize=12, leading=17, spaceAfter=10, wordWrap=wrap)
    label = ParagraphStyle("label", fontName=font, fontSize=11, leading=18, wordWrap=wrap)
    body = ParagraphStyle("body", fontName=font, fontSize=10, leading=15, spaceAfter=3, wordWrap=wrap)
    small = ParagraphStyle("small", fontName=font, fontSize=8, leading=11, textColor=colors.grey, wordWrap=wrap)

    flow: list = [
        Paragraph(_esc(t["title"]), h1),
        Paragraph(_esc(t["type_exclusive"] if exclusive else t["type_nonexclusive"]), h2),
    ]

    def field(lbl: str, val: str) -> None:
        if val:
            flow.append(Paragraph(f"<b>{_esc(lbl)}:</b> {_esc(val)}", label))

    field(t["beat"], track.title)
    field(t["licensor"], producer)
    field(t["licensee"], buyer)
    field(t["tier"], tier.name)
    field(t["deliverables"], deliverables)
    field(t["price"], price_str)
    field(t["date"], date_str)

    flow.append(Spacer(1, 5 * mm))
    flow.append(Paragraph(_esc(t["terms_heading"]), h2))
    terms = t["terms_exclusive"] if exclusive else t["terms_nonexclusive"]
    for i, clause in enumerate(terms, 1):
        flow.append(Paragraph(f"{i}. {_esc(clause)}", body))

    flow.append(Spacer(1, 16 * mm))
    flow.append(Paragraph(_esc(t["signatures"]), label))
    flow.append(Spacer(1, 8 * mm))
    flow.append(Paragraph(_esc(t["disclaimer"]), small))

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=22 * mm,
        bottomMargin=20 * mm,
        title=f"{track.title} — {tier.name}",
    )
    doc.build(flow)
    return buf.getvalue()
