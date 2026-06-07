import anyio
import pytest
from httpx import ASGITransport, AsyncClient

from beatos_http.app import create_app
from beatos_http.mcp_auth import get_mcp_token

_INIT = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {"name": "test", "version": "0.0.1"},
    },
}


async def test_mcp_endpoint_responds_to_initialize() -> None:
    app = create_app()
    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://127.0.0.1:8000"
        ) as c:
            r = await c.post(
                "/mcp",
                json=_INIT,
                headers={
                    "Accept": "application/json, text/event-stream",
                    "Authorization": f"Bearer {get_mcp_token()}",
                },
                follow_redirects=True,
            )
    assert r.status_code == 200
    assert "mcp-session-id" in r.headers
    assert "result" in r.text


async def test_mcp_endpoint_rejects_without_token() -> None:
    """The /mcp guard rejects a request that doesn't carry the local token."""
    app = create_app()
    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://127.0.0.1:8000"
        ) as c:
            r = await c.post(
                "/mcp",
                json=_INIT,
                headers={"Accept": "application/json, text/event-stream"},
                follow_redirects=True,
            )
    assert r.status_code == 401
