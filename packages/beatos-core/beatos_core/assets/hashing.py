"""Async chunked sha256 — never blocks the event loop on big files."""
from __future__ import annotations

import asyncio
import hashlib
import pathlib

_CHUNK_BYTES = 65536  # 64KB


def _sha256_sync(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(_CHUNK_BYTES), b""):
            h.update(chunk)
    return h.hexdigest()


async def sha256_file(path: pathlib.Path | str) -> str:
    """Compute sha256 of a file. Runs the blocking work in a thread."""
    path = pathlib.Path(path)
    return await asyncio.to_thread(_sha256_sync, path)
