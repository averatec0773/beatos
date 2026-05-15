"""Watchdog daemon: watches each library's configured folders for new audio files.

Responsibilities:
- When a new audio file appears in a watched folder, create a draft track
  + linked audio asset.
- When a watched file is moved, re-link the existing asset.
- When a watched file is deleted, mark the asset as missing.

Per-library lifecycle: when init_library_root activates a library, we
look up watch_folder rows for that library and start an Observer for each.
On switch, we stop the previous library's observers and start the new ones.
"""
from __future__ import annotations

import asyncio
import datetime as _dt
import mimetypes
import pathlib
import threading

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

from beatos_core import state
from beatos_core.assets.hashing import sha256_file
from beatos_core.assets.metadata import read_audio_metadata

_AUDIO_EXTS = {".wav", ".mp3", ".aif", ".aiff", ".flac"}


def _is_audio(path: str) -> bool:
    return pathlib.Path(path).suffix.lower() in _AUDIO_EXTS


class _Handler(FileSystemEventHandler):
    def __init__(self, library_id: int, loop: asyncio.AbstractEventLoop) -> None:
        super().__init__()
        self._library_id = library_id
        self._loop = loop

    def on_created(self, event: FileSystemEvent) -> None:  # type: ignore[override]
        if event.is_directory or not _is_audio(event.src_path):
            return
        asyncio.run_coroutine_threadsafe(
            _handle_created(self._library_id, pathlib.Path(event.src_path)),
            self._loop,
        )

    def on_deleted(self, event: FileSystemEvent) -> None:  # type: ignore[override]
        if event.is_directory or not _is_audio(event.src_path):
            return
        asyncio.run_coroutine_threadsafe(
            _handle_deleted(self._library_id, pathlib.Path(event.src_path)),
            self._loop,
        )

    def on_moved(self, event: FileSystemEvent) -> None:  # type: ignore[override]
        if event.is_directory:
            return
        if _is_audio(getattr(event, "dest_path", "")):
            asyncio.run_coroutine_threadsafe(
                _handle_moved(
                    self._library_id,
                    pathlib.Path(event.src_path),
                    pathlib.Path(event.dest_path),
                ),
                self._loop,
            )


async def _handle_created(library_id: int, path: pathlib.Path) -> None:
    """Create a draft track + linked audio asset for a newly-seen file.

    Dedup by sha256 — if an asset with this hash already exists in the library,
    skip (the file was likely just moved to this folder from elsewhere).
    """
    import aiosqlite
    from beatos_core.library.service import _library_db_path  # noqa: PLC2701

    sha = await sha256_file(path)
    # Find db for this library
    active = state.get_active()
    if active is None or active.library.id != library_id:
        return
    db_path = active.db_path

    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT 1 FROM asset WHERE sha256 = ?", (sha,)
        ) as cur:
            if await cur.fetchone() is not None:
                return  # already imported

        meta = read_audio_metadata(path) or {}
        title = path.stem
        now = _dt.datetime.now(_dt.timezone.utc).isoformat()
        mime, _ = mimetypes.guess_type(str(path))

        async with conn.execute(
            "INSERT INTO track (library_id, title, license_type, bpm, created_at, updated_at) "
            "VALUES (?, ?, 'lease_basic', ?, ?, ?)",
            (library_id, title, meta.get("bpm"), now, now),
        ) as cur:
            track_id = cur.lastrowid

        await conn.execute(
            "INSERT INTO asset (track_id, role, mode, abs_path, sha256, size_bytes, "
            "mime_type, missing, created_at) "
            "VALUES (?, 'audio', 'linked', ?, ?, ?, ?, 0, ?)",
            (track_id, str(path.resolve()), sha, path.stat().st_size, mime, now),
        )
        await conn.commit()


async def _handle_deleted(library_id: int, path: pathlib.Path) -> None:
    """Mark any asset pointing at this path as missing."""
    import aiosqlite
    active = state.get_active()
    if active is None or active.library.id != library_id:
        return
    async with aiosqlite.connect(active.db_path) as conn:
        await conn.execute(
            "UPDATE asset SET missing = 1 WHERE abs_path = ?", (str(path.resolve()),)
        )
        await conn.commit()


async def _handle_moved(library_id: int, src: pathlib.Path, dst: pathlib.Path) -> None:
    """Update an asset's abs_path if its old path matches."""
    import aiosqlite
    active = state.get_active()
    if active is None or active.library.id != library_id:
        return
    async with aiosqlite.connect(active.db_path) as conn:
        await conn.execute(
            "UPDATE asset SET abs_path = ?, missing = 0 WHERE abs_path = ?",
            (str(dst.resolve()), str(src.resolve())),
        )
        await conn.commit()


def start_watcher(library_id: int, paths: list[pathlib.Path], loop: asyncio.AbstractEventLoop) -> Observer:
    """Spawn an Observer for `paths`. Caller stores in state.set_watcher."""
    observer = Observer()
    handler = _Handler(library_id, loop)
    for p in paths:
        if p.exists() and p.is_dir():
            observer.schedule(handler, str(p), recursive=True)
    observer.start()
    return observer


def stop_watcher(library_id: int) -> None:
    obs = state.remove_watcher(library_id)
    if obs is None:
        return
    obs.stop()  # type: ignore[attr-defined]
    obs.join(timeout=2.0)  # type: ignore[attr-defined]
