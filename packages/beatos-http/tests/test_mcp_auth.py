"""Dedicated tests for the /mcp bearer-token guard (beatos_http/mcp_auth.py).

This guard is the only thing between "any local process" and the MCP agent
surface, so its behavior gets its own file (previously covered only
incidentally via test_mcp_mount).
"""
from __future__ import annotations

import pytest

from beatos_http.mcp_auth import get_mcp_token, guard_mcp_app


class _InnerApp:
    def __init__(self):
        self.called = False

    async def __call__(self, scope, receive, send):
        self.called = True


def _http_scope(headers=None):
    return {"type": "http", "headers": headers or []}


@pytest.mark.asyncio
async def test_missing_bearer_is_rejected_before_the_app():
    inner = _InnerApp()
    app = guard_mcp_app(inner, "tok")
    sends = []

    async def send(msg):
        sends.append(msg)

    await app(_http_scope(), None, send)
    assert inner.called is False
    assert sends[0]["type"] == "http.response.start"
    assert sends[0]["status"] == 401


@pytest.mark.asyncio
async def test_wrong_bearer_is_rejected():
    inner = _InnerApp()
    app = guard_mcp_app(inner, "tok")
    sends = []

    async def send(msg):
        sends.append(msg)

    await app(_http_scope([(b"authorization", b"Bearer nope")]), None, send)
    assert inner.called is False
    assert sends[0]["status"] == 401


@pytest.mark.asyncio
async def test_correct_bearer_reaches_the_app():
    inner = _InnerApp()
    app = guard_mcp_app(inner, "tok")

    async def send(msg):  # pragma: no cover - inner app sends nothing
        raise AssertionError("guard should not answer on success")

    await app(_http_scope([(b"authorization", b"Bearer tok")]), None, send)
    assert inner.called is True


@pytest.mark.asyncio
async def test_lifespan_scope_passes_without_auth():
    inner = _InnerApp()
    app = guard_mcp_app(inner, "tok")
    await app({"type": "lifespan"}, None, None)
    assert inner.called is True


def test_guard_disabled_returns_app_unwrapped():
    inner = _InnerApp()
    assert guard_mcp_app(inner, None) is inner


def test_token_disabled_by_kill_switch(monkeypatch):
    get_mcp_token.cache_clear()
    monkeypatch.setenv("BEATOS_MCP_DISABLE_AUTH", "1")
    assert get_mcp_token() is None
    get_mcp_token.cache_clear()


def test_token_is_process_stable(monkeypatch):
    # The handshake advertises the same value the guard enforces — that only
    # holds because get_mcp_token() is cached per process.
    monkeypatch.delenv("BEATOS_MCP_DISABLE_AUTH", raising=False)
    get_mcp_token.cache_clear()
    first = get_mcp_token()
    assert first and get_mcp_token() == first
    get_mcp_token.cache_clear()
