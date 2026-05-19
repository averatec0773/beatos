"""SSE stream: emit pending_changed on insert; clean disconnect on close."""
import asyncio
import threading

import aiosqlite
import httpx
import pytest
import uvicorn

from beatos_core.db import run_migrations
from beatos_core.two_phase import create_token
from beatos_http.app import create_app


@pytest.fixture
async def db_path(tmp_path, monkeypatch):
    path = tmp_path / "test.db"
    await run_migrations(path)
    monkeypatch.setenv("BEATOS_DB_PATH", str(path))
    return path


@pytest.fixture
def live_server(db_path):
    """Spin up a real uvicorn server so SSE streams incrementally."""
    app = create_app()
    config = uvicorn.Config(app, host="127.0.0.1", port=0, log_level="error")
    server = uvicorn.Server(config)

    # Patch server to expose the bound port
    original_startup = server.startup

    async def startup_and_capture(sockets=None):
        await original_startup(sockets=sockets)

    thread = threading.Thread(target=lambda: asyncio.run(server.serve()), daemon=True)
    thread.start()

    # Wait for server to be ready
    import time
    for _ in range(50):
        if server.started:
            break
        time.sleep(0.1)

    # Get the actual bound port
    port = server.servers[0].sockets[0].getsockname()[1]

    yield f"http://127.0.0.1:{port}"

    server.should_exit = True
    thread.join(timeout=3)


@pytest.mark.asyncio
async def test_sse_emits_pending_changed_on_new_token(live_server, db_path):
    """Open SSE, write a new pending token, expect a pending_changed event."""
    received: list[str] = []

    async def reader():
        async with httpx.AsyncClient(timeout=10) as c:
            async with c.stream("GET", f"{live_server}/api/tokens/stream") as resp:
                assert resp.status_code == 200
                async for line in resp.aiter_lines():
                    if line.startswith("event:"):
                        received.append(line.split(":", 1)[1].strip())
                    if len(received) >= 2:  # initial snapshot + after-write event
                        break

    async def writer():
        await asyncio.sleep(1.5)
        async with aiosqlite.connect(db_path) as conn:
            await create_token(conn, "create_list", {"name": "Late"})

    await asyncio.wait_for(asyncio.gather(reader(), writer()), timeout=8)
    assert "pending_changed" in received
