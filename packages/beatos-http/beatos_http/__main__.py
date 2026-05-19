"""Entry point: `python -m beatos_http` starts uvicorn on an ephemeral port.

Steps:
1. Bind a socket to port 0 to get an OS-assigned free port.
2. Write the handshake file so Electron main can read the port.
3. Hand the socket to uvicorn.
"""
from __future__ import annotations

import atexit
import socket

from beatos_http.handshake import default_handshake_path
from beatos_http.logging_config import configure as _configure_logging

_configure_logging()

import uvicorn

from beatos_http.app import create_app
from beatos_http.handshake import write_handshake


def _bind_ephemeral(host: str = "127.0.0.1") -> tuple[socket.socket, int]:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((host, 0))
    port = sock.getsockname()[1]
    return sock, port


def _cleanup_handshake() -> None:
    try:
        default_handshake_path().unlink(missing_ok=True)
    except Exception:
        pass


def main() -> None:
    atexit.register(_cleanup_handshake)
    sock, port = _bind_ephemeral()
    try:
        write_handshake(port=port)
        config = uvicorn.Config(
            app=create_app(),
            host="127.0.0.1",
            port=port,
            log_level="info",
            access_log=False,
        )
        server = uvicorn.Server(config)
        server.run(sockets=[sock])
    finally:
        sock.close()


if __name__ == "__main__":
    main()
