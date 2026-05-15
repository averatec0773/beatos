"""Audio metadata extraction via mutagen.

Returns a small dict of {duration_seconds, sample_rate, bpm?} or None on failure.
BPM is not present in raw WAV/MP3 metadata for most BeatOS users — we leave
it unset and let the user fill it in manually. If the file does carry a TBPM
ID3 frame, we read it.
"""
from __future__ import annotations

import pathlib
from typing import Optional, TypedDict

from mutagen import File as MutagenFile


class AudioMetadata(TypedDict, total=False):
    duration_seconds: float
    sample_rate: int
    bpm: int


def read_audio_metadata(path: pathlib.Path | str) -> Optional[AudioMetadata]:
    """Read audio metadata. Returns None for unreadable / invalid files."""
    path = pathlib.Path(path)
    try:
        mf = MutagenFile(str(path))
    except Exception:
        return None
    if mf is None:
        return None

    out: AudioMetadata = {}
    info = getattr(mf, "info", None)
    if info is not None:
        if hasattr(info, "length") and info.length is not None:
            out["duration_seconds"] = float(info.length)
        if hasattr(info, "sample_rate") and info.sample_rate:
            out["sample_rate"] = int(info.sample_rate)

    # BPM may live in ID3 TBPM tag for MP3s
    try:
        tbpm = mf.tags.get("TBPM") if mf.tags else None  # type: ignore[union-attr]
        if tbpm:
            text = tbpm.text[0] if hasattr(tbpm, "text") else str(tbpm)
            out["bpm"] = int(float(text))
    except Exception:
        pass

    return out if out else None
