"""Entry point: `python -m beatos_http` starts uvicorn on an ephemeral port.

Steps:
1. Bind a socket to port 0 to get an OS-assigned free port.
2. Hand the socket to uvicorn.
3. Write the handshake file only AFTER uvicorn is listening (in the server's
   startup hook) — writing it at bind time races the bind→listen gap, so a
   client that reads the port too early gets Connection refused (audit B2).
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


class _HandshakeServer(uvicorn.Server):
    """uvicorn Server that publishes the handshake once it is actually serving.

    `startup()` completes only after the socket has been put into listen mode
    and the app lifespan has run, so writing the handshake here guarantees the
    advertised port is already accepting requests — closing the bind→listen
    race (audit B2).
    """

    def __init__(self, config: uvicorn.Config, port: int) -> None:
        super().__init__(config)
        self._handshake_port = port

    async def startup(self, sockets: list | None = None) -> None:
        await super().startup(sockets=sockets)
        write_handshake(port=self._handshake_port)


def main() -> None:
    atexit.register(_cleanup_handshake)
    sock, port = _bind_ephemeral()
    try:
        config = uvicorn.Config(
            app=create_app(),
            host="127.0.0.1",
            port=port,
            log_level="info",
            access_log=False,
        )
        server = _HandshakeServer(config, port=port)
        server.run(sockets=[sock])
    finally:
        sock.close()


if __name__ == "__main__":
    main()
