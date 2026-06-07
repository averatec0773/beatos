"""stdio->HTTP bridge launcher. Reads handshake, validates sidecar liveness,
then exec's mcp-proxy to relay JSON-RPC between Claude Desktop and the
sidecar's /mcp endpoint."""
from __future__ import annotations

import json
import os
import socket
import sys
from pathlib import Path
from typing import Callable

from beatos_http.handshake import default_handshake_path


class DiscoveryError(RuntimeError):
    pass


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


def _default_exec(args: list[str]) -> None:
    """Replace this process with the given command. Never returns on success."""
    os.execvp(args[0], args)


def run_launcher(
    handshake_path: Path | None = None,
    *,
    _exec: Callable[[list[str]], None] = _default_exec,
    _health_probe: Callable[[int], bool] = _default_health_probe,
) -> None:
    """Run the discovery + exec sequence. Raises DiscoveryError on failure;
    on success, calls _exec (which by default replaces this process)."""
    path = handshake_path or default_handshake_path()

    if not path.exists():
        raise DiscoveryError(
            f"BeatOS sidecar not running (no handshake at {path}). "
            "Open BeatOS desktop app and retry."
        )

    try:
        data = json.loads(path.read_text())
        port = int(data["port"])
        pid = int(data["pid"])
        token = data.get("token")  # optional: absent when /mcp auth is disabled
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        raise DiscoveryError(f"handshake file malformed: {e}") from e

    if not _pid_alive(pid):
        raise DiscoveryError(
            f"BeatOS sidecar process not found (stale pid {pid}). "
            "Restart BeatOS desktop app."
        )

    if not _health_probe(port):
        raise DiscoveryError(
            f"BeatOS sidecar not responding on port {port}. Restart BeatOS."
        )

    target = f"http://127.0.0.1:{port}/mcp"
    # mcp-proxy >=0.10: --transport=streamablehttp targets the sidecar's
    # Streamable HTTP /mcp endpoint; bridges Claude Desktop stdio to it.
    args = ["mcp-proxy"]
    if token:
        # Echo the sidecar's local token so the /mcp guard accepts the connection.
        args += ["--headers", "Authorization", f"Bearer {token}"]
    args += ["--transport=streamablehttp", target]
    _exec(args)


def main() -> None:
    try:
        run_launcher()
    except DiscoveryError as e:
        sys.stderr.write(f"{e}\n")
        sys.exit(1)
