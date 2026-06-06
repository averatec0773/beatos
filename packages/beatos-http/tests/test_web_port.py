"""main() honors BEATOS_HTTP_PORT (fixed bind) for web mode; ephemeral otherwise."""
import socket

import pytest

import beatos_http.__main__ as entry


async def _noop_serve(sock, port):
    """Stand-in for _serve so main() runs without starting uvicorn; the real
    asyncio.run executes this coroutine — no global asyncio patch needed."""


def test_fixed_port_when_env_set(monkeypatch):
    monkeypatch.setenv("BEATOS_HTTP_PORT", "8765")
    fake_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    calls = {}

    def fake_bind_fixed(port, host="127.0.0.1"):
        calls["fixed_port"] = port
        return fake_sock

    def boom_ephemeral(host="127.0.0.1"):
        raise AssertionError("must not bind ephemeral when BEATOS_HTTP_PORT is set")

    monkeypatch.setattr(entry, "_try_bind_fixed", fake_bind_fixed)
    monkeypatch.setattr(entry, "_bind_ephemeral", boom_ephemeral)
    monkeypatch.setattr(entry, "_serve", _noop_serve)

    entry.main()
    assert calls["fixed_port"] == 8765


def test_ephemeral_when_env_unset(monkeypatch):
    monkeypatch.delenv("BEATOS_HTTP_PORT", raising=False)
    fake_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    calls = {}

    def fake_ephemeral(host="127.0.0.1"):
        calls["ephemeral"] = True
        return fake_sock, 5555

    monkeypatch.setattr(entry, "_bind_ephemeral", fake_ephemeral)
    monkeypatch.setattr(entry, "_serve", _noop_serve)

    entry.main()
    assert calls.get("ephemeral") is True


def test_fixed_port_in_use_exits(monkeypatch):
    monkeypatch.setenv("BEATOS_HTTP_PORT", "8765")
    monkeypatch.setattr(entry, "_try_bind_fixed", lambda port, host="127.0.0.1": None)

    with pytest.raises(SystemExit, match=r"BEATOS_HTTP_PORT"):
        entry.main()


def test_invalid_port_exits(monkeypatch):
    monkeypatch.setenv("BEATOS_HTTP_PORT", "not-a-number")

    with pytest.raises(SystemExit, match=r"not a valid integer"):
        entry.main()
