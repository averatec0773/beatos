"""Entry point: `python -m beatos_http` starts uvicorn on an ephemeral port.

Steps:
1. Bind a socket to port 0 to get an OS-assigned free port.
2. Hand the socket to uvicorn.
3. Write the handshake file only AFTER uvicorn is listening (in the server's
   startup hook) — writing it at bind time races the bind→listen gap, so a
   client that reads the port too early gets Connection refused (audit B2).
"""
from __future__ import annotations

import asyncio
import atexit
import logging
import socket

from beatos_http.handshake import default_handshake_path
from beatos_http.logging_config import configure as _configure_logging

_configure_logging()

import uvicorn

from beatos_http.app import create_app, create_inject_app, INJECT_PORT, _try_bind_fixed
from beatos_http.handshake import write_handshake

log = logging.getLogger(__name__)


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


async def _serve(main_sock: socket.socket, main_port: int) -> None:
    main_cfg = uvicorn.Config(
        app=create_app(),
        host="127.0.0.1",
        port=main_port,
        log_level="info",
        access_log=False,
    )
    main_server = _HandshakeServer(main_cfg, port=main_port)
    coros = [main_server.serve(sockets=[main_sock])]

    inject_sock = _try_bind_fixed(INJECT_PORT)
    if inject_sock is not None:
        inj_cfg = uvicorn.Config(
            app=create_inject_app(),
            host="127.0.0.1",
            port=INJECT_PORT,
            log_level="warning",
            access_log=False,
        )
        inj_server = uvicorn.Server(inj_cfg)

        async def _run_inject() -> None:
            try:
                await inj_server.serve(sockets=[inject_sock])
            except Exception:
                # Inject is best-effort: its failure must never take down the
                # main API. Pre-bind contention is handled above; this guards
                # post-startup faults.
                log.exception("inject app crashed — extension upload disabled this session")

        coros.append(_run_inject())
        log.info("inject app listening on fixed port %d", INJECT_PORT)
    else:
        log.warning(
            "inject fixed port %d in use — browser-extension upload disabled this session",
            INJECT_PORT,
        )

    await asyncio.gather(*coros)


def main() -> None:
    atexit.register(_cleanup_handshake)
    sock, port = _bind_ephemeral()
    try:
        asyncio.run(_serve(sock, port))
    finally:
        sock.close()


if __name__ == "__main__":
    main()
