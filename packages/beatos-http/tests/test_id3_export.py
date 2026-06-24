"""EPIC-D13-1: mutagen ID3 writer (write -> read-back round trip)."""
from __future__ import annotations

import datetime as dt
import io

from mutagen.id3 import ID3

from beatos_core.models.track import Track

from beatos_http.id3_export import write_id3_tags

_TS = dt.datetime(2026, 1, 1, 12, 0, 0)
# A fake MPEG frame (sync word + filler) — enough to round-trip tags; audio
# validity is irrelevant to ID3 read-back.
_SRC = b"\xff\xfb\x90\x00" + b"\x00" * 4096


def _track(**kw) -> Track:
    base = dict(
        id=1,
        title="Midnight Drive",
        producer=["AVERATEC"],
        genre=["Trap"],
        bpm=140,
        key_signature="A min",
        description="dark trap beat",
        created_at=_TS,
        updated_at=_TS,
    )
    base.update(kw)
    return Track(**base)


def test_writes_frames_roundtrip():
    cover = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
    out = write_id3_tags(source_mp3=_SRC, track=_track(), cover=cover)
    assert out != _SRC  # tags were added

    tags = ID3(io.BytesIO(out))
    assert tags["TIT2"].text[0] == "Midnight Drive"
    assert tags["TPE1"].text[0] == "AVERATEC"
    assert tags["TCON"].text[0] == "Trap"
    assert tags["TBPM"].text[0] == "140"
    assert tags["TKEY"].text[0] == "A min"
    assert tags.getall("COMM")[0].text[0] == "dark trap beat"
    apic = tags.getall("APIC")
    assert apic and apic[0].mime == "image/png"
    assert apic[0].data == cover


def test_does_not_mutate_source():
    original = bytes(_SRC)
    write_id3_tags(source_mp3=original, track=_track(), cover=None)
    assert original == _SRC  # the source bytes are never modified


def test_missing_fields_are_skipped():
    out = write_id3_tags(
        source_mp3=_SRC,
        track=_track(producer=None, genre=None, bpm=None, key_signature=None, description=None),
        cover=None,
    )
    tags = ID3(io.BytesIO(out))
    assert tags["TIT2"].text[0] == "Midnight Drive"
    assert tags.getall("TPE1") == []
    assert tags.getall("TBPM") == []
    assert tags.getall("APIC") == []
