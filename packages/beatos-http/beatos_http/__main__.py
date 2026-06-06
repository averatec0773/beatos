"""Entry point: `python -m beatos_http` starts uvicorn.

Two modes:
- Electron (default): bind an OS-assigned ephemeral port (port 0) and advertise
  it via the handshake file once uvicorn is listening.
- Web (`BEATOS_HTTP_PORT` set): bind that fixed port so a browser can open a
  stable localhost URL; the SPA is served by the app when `BEATOS_WEB_DIR` is set.

The handshake file is written only AFTER uvicorn is listening (in the server's
startup hook) — writing it at bind time races the bind→listen gap, so a client
that reads the port too early gets Connection refused (audit B2).
"""
from __future__ import annotations

import asyncio
import atexit
import logging
import os
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
    fixed = os.environ.get("BEATOS_HTTP_PORT")
    if fixed:
        # Web mode: bind a known port so the browser can open a stable URL.
        try:
            port = int(fixed)
        except ValueError:
            raise SystemExit(f"BEATOS_HTTP_PORT={fixed!r} is not a valid integer")
        sock = _try_bind_fixed(port)
        if sock is None:
            raise SystemExit(f"BEATOS_HTTP_PORT={port} is already in use")
    else:
        # Electron mode: OS-assigned ephemeral port advertised via handshake.
        sock, port = _bind_ephemeral()
    try:
        asyncio.run(_serve(sock, port))
    finally:
        sock.close()


if __name__ == "__main__":
    main()
