"""Port handshake — Python sidecar writes; Electron main reads."""
from __future__ import annotations

import datetime as _dt
import json
import os
import pathlib
import sys
from dataclasses import dataclass


@dataclass(frozen=True)
class Handshake:
    port: int
    started_at: str
    pid: int
    token: str | None = None


def default_handshake_path() -> pathlib.Path:
    """Return the conventional handshake path for this platform.

    Honors `BEATOS_HANDSHAKE_PATH` env var (set by Electron main) when present.
    """
    override = os.environ.get("BEATOS_HANDSHAKE_PATH")
    if override:
        return pathlib.Path(override)

    if sys.platform == "darwin":
        base = pathlib.Path.home() / "Library" / "Application Support" / "beatos-desktop"
    elif sys.platform.startswith("win"):
        base = pathlib.Path(os.environ.get("APPDATA", pathlib.Path.home())) / "beatos-desktop"
    else:
        xdg = os.environ.get("XDG_RUNTIME_DIR")
        base = pathlib.Path(xdg) / "beatos" if xdg else pathlib.Path.home() / ".cache" / "beatos"

    return base / "runtime" / "handshake.json"


def write_handshake(
    port: int, path: pathlib.Path | None = None, *, token: str | None = None
) -> pathlib.Path:
    """Write the handshake JSON atomically. Returns the path written.

    `token` (when set) is the local /mcp auth token the launcher must echo back as
    an Authorization header; omitted from the payload when None (auth disabled)."""
    path = path or default_handshake_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "port": port,
        "started_at": _dt.datetime.now(_dt.timezone.utc).isoformat(),
        "pid": os.getpid(),
    }
    if token:
        payload["token"] = token
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload), encoding="utf-8")
    tmp.replace(path)
    return path


def read_handshake(path: pathlib.Path | None = None) -> Handshake:
    """Read and parse the handshake JSON. Raises FileNotFoundError if missing."""
    path = path or default_handshake_path()
    data = json.loads(path.read_text(encoding="utf-8"))
    return Handshake(
        port=int(data["port"]),
        started_at=str(data["started_at"]),
        pid=int(data["pid"]),
        token=data.get("token"),
    )
