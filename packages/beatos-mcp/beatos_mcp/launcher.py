"""stdio<->/mcp discovery for the in-process resilient proxy.

`discover_sidecar` reads the sidecar handshake and validates liveness, returning
a `SidecarTarget` when BeatOS is up and reachable, or `None` (logged, never
raised) when it is not. The proxy (`beatos_mcp.proxy`) calls this lazily so the
launcher always completes the MCP handshake even while BeatOS is offline.

Rule 8: nothing here writes stdout — reasons are logged to file/stderr only.
"""
from __future__ import annotations

import json
import os
import socket
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import structlog

from beatos_http.handshake import default_handshake_path

log = structlog.get_logger("beatos_mcp")


@dataclass(frozen=True)
class SidecarTarget:
    """A reachable sidecar /mcp endpoint and its optional local auth token."""

    url: str
    token: str | None


def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except (ProcessLookupError, PermissionError):
        return False
    except OSError:
        return False


def _default_health_probe(port: int) -> bool:
    """Best-effort TCP connect to 127.0.0.1:port. 500ms timeout."""
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.5):
            return True
    except OSError:
        return False


def discover_sidecar(
    handshake_path: Path | None = None,
    *,
    _health_probe: Callable[[int], bool] = _default_health_probe,
) -> SidecarTarget | None:
    """Resolve a live sidecar target, or None if BeatOS is unavailable.

    Never raises: every failure mode (missing/malformed handshake, dead pid,
    unreachable port) is logged at info level and returns None so the proxy can
    serve its degraded surface instead of crashing the launcher.
    """
    path = handshake_path or default_handshake_path()

    if not path.exists():
        log.info("sidecar.offline", reason="no_handshake", path=str(path))
        return None

    try:
        data = json.loads(path.read_text())
        port = int(data["port"])
        pid = int(data["pid"])
        token = data.get("token")  # optional: absent when /mcp auth is disabled
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        log.info("sidecar.offline", reason="malformed_handshake", error=str(e))
        return None

    if not _pid_alive(pid):
        log.info("sidecar.offline", reason="stale_pid", pid=pid)
        return None

    if not _health_probe(port):
        log.info("sidecar.offline", reason="port_unreachable", port=port)
        return None

    return SidecarTarget(url=f"http://127.0.0.1:{port}/mcp", token=token)


def main() -> None:
    """Console-script entrypoint: run the resilient in-process proxy forever."""
    import anyio

    from beatos_mcp.proxy import run_proxy

    anyio.run(run_proxy)
