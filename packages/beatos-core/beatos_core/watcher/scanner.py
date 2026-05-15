"""One-shot scan of a folder — used when adding a watch folder for the first time."""
from __future__ import annotations

import pathlib
from typing import TypedDict

from beatos_core.assets.hashing import sha256_file
from beatos_core.assets.metadata import read_audio_metadata

_AUDIO_EXTS = {".wav", ".mp3", ".aif", ".aiff", ".flac"}


class ScannedFile(TypedDict, total=False):
    path: str
    sha256: str
    size_bytes: int
    duration_seconds: float
    sample_rate: int
    bpm: int


async def scan_folder(folder: pathlib.Path | str) -> list[ScannedFile]:
    """Recursively find audio files under `folder`, hash + read metadata.

    Returns a list of dicts ready to drive the FirstScanModal in the UI.
    """
    folder = pathlib.Path(folder).resolve()
    if not folder.exists() or not folder.is_dir():
        return []

    out: list[ScannedFile] = []
    for path in sorted(folder.rglob("*")):
        if not path.is_file():
            continue
        if path.suffix.lower() not in _AUDIO_EXTS:
            continue
        entry: ScannedFile = {
            "path": str(path.resolve()),
            "size_bytes": path.stat().st_size,
            "sha256": await sha256_file(path),
        }
        meta = read_audio_metadata(path)
        if meta:
            entry.update(meta)  # type: ignore[typeddict-item]
        out.append(entry)
    return out
