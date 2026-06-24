"""ID3-tagged MP3 export (EPIC-D13-1).

Pure-ish writer: (source MP3 bytes + Track + optional cover bytes) -> a COPY of the
MP3 with ID3 frames filled from the catalog. NEVER mutates the user's original file —
it works on an in-memory BytesIO copy and returns new bytes. mutagen is already a
beatos-core dependency (used for tag reading), so this adds no new dependency.

Lives in beatos-http (single consumer = the export route, mirrors license_contract.py),
keeping beatos-core dependency-light.

Frame map (recommended set, approved): TIT2 title · TPE1 producer(s) · TCON genre(s) ·
TBPM bpm · TKEY key · COMM description · APIC cover art. Missing fields are skipped.
"""
from __future__ import annotations

import io
from typing import Optional

from mutagen.id3 import APIC, COMM, ID3, TBPM, TCON, TIT2, TKEY, TPE1, ID3NoHeaderError

from beatos_core.models.track import Track


def _cover_mime(data: bytes) -> str:
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    return "image/jpeg"  # sensible default; most covers are JPEG/PNG


def write_id3_tags(*, source_mp3: bytes, track: Track, cover: Optional[bytes] = None) -> bytes:
    """Return a copy of `source_mp3` with ID3 frames written from `track`.

    The original bytes are never modified — all work happens on an in-memory copy.
    """
    buf = io.BytesIO(source_mp3)
    try:
        tags = ID3(buf)
    except ID3NoHeaderError:
        tags = ID3()

    if track.title:
        tags.setall("TIT2", [TIT2(encoding=3, text=[track.title])])
    if track.producer:
        tags.setall("TPE1", [TPE1(encoding=3, text=[", ".join(track.producer)])])
    if track.genre:
        tags.setall("TCON", [TCON(encoding=3, text=[", ".join(track.genre)])])
    if track.bpm is not None:
        tags.setall("TBPM", [TBPM(encoding=3, text=[str(track.bpm)])])
    if track.key_signature:
        tags.setall("TKEY", [TKEY(encoding=3, text=[track.key_signature])])
    if track.description:
        tags.setall(
            "COMM",
            [COMM(encoding=3, lang="eng", desc="", text=[track.description])],
        )
    if cover:
        tags.setall(
            "APIC",
            [APIC(encoding=3, mime=_cover_mime(cover), type=3, desc="Cover", data=cover)],
        )

    buf.seek(0)
    tags.save(buf)
    return buf.getvalue()
