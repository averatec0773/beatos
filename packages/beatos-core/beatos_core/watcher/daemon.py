from __future__ import annotations

import logging
from pathlib import Path
from typing import Callable

from watchdog.events import FileCreatedEvent, FileSystemEventHandler
from watchdog.observers import Observer

log = logging.getLogger(__name__)


OnNewFile = Callable[[Path, int], None]


class _SourceHandler(FileSystemEventHandler):
    def __init__(self, source_id: int, on_new_file: OnNewFile) -> None:
        self._source_id = source_id
        self._on_new_file = on_new_file

    def on_created(self, event):  # type: ignore[override]
        if event.is_directory:
            return
        try:
            self._on_new_file(Path(event.src_path), self._source_id)
        except Exception:
            log.exception("on_new_file handler raised")


class WatcherRegistry:
    """Keeps one watchdog.Observer per online Source.
    Lifecycle methods are idempotent.
    """

    def __init__(self, on_new_file: OnNewFile) -> None:
        self._on_new_file = on_new_file
        self._observers: dict[int, Observer] = {}

    def start_for_source(self, source_id: int, root: Path) -> None:
        if source_id in self._observers:
            return
        observer = Observer()
        handler = _SourceHandler(source_id=source_id, on_new_file=self._on_new_file)
        observer.schedule(handler, str(root), recursive=True)
        observer.start()
        self._observers[source_id] = observer
        log.info("watcher started for source %d at %s", source_id, root)

    def stop_for_source(self, source_id: int) -> None:
        observer = self._observers.pop(source_id, None)
        if observer is None:
            return
        observer.stop()
        observer.join(timeout=2.0)
        log.info("watcher stopped for source %d", source_id)

    def stop_all(self) -> None:
        for sid in list(self._observers.keys()):
            self.stop_for_source(sid)

    def active_source_ids(self) -> set[int]:
        return set(self._observers.keys())


# ---------------------------------------------------------------------------
# v0.0.3 shims — removed in v0.0.4; kept so import errors are explicit.
# Callers: beatos_core.library.service, beatos_http.routes.watch_folders
# These will be cleaned up in Phase 5.
# ---------------------------------------------------------------------------

def start_watcher(*args, **kwargs):  # type: ignore[no-untyped-def]
    raise NotImplementedError("start_watcher removed in v0.0.4 — use WatcherRegistry")


def stop_watcher(*args, **kwargs):  # type: ignore[no-untyped-def]
    raise NotImplementedError("stop_watcher removed in v0.0.4 — use WatcherRegistry")
