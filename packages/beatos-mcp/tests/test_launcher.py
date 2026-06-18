import json
import os
from pathlib import Path

from beatos_mcp.launcher import SidecarTarget, discover_sidecar


def _write(path: Path, *, port: int, pid: int, token: str | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload: dict = {"port": port, "pid": pid, "started_at": "2026-06-17T00:00:00Z"}
    if token:
        payload["token"] = token
    path.write_text(json.dumps(payload))


def test_missing_handshake_returns_none(tmp_path: Path) -> None:
    assert discover_sidecar(tmp_path / "nope.json") is None


def test_stale_pid_returns_none(tmp_path: Path) -> None:
    p = tmp_path / "h.json"
    _write(p, port=0, pid=2_000_000)
    assert discover_sidecar(p) is None


def test_unreachable_port_returns_none(tmp_path: Path) -> None:
    p = tmp_path / "h.json"
    _write(p, port=1, pid=os.getpid())
    assert discover_sidecar(p, _health_probe=lambda _p: False) is None


def test_malformed_returns_none(tmp_path: Path) -> None:
    p = tmp_path / "h.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("{ not valid json")
    assert discover_sidecar(p) is None


def test_missing_pid_returns_none(tmp_path: Path) -> None:
    p = tmp_path / "h.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text('{"port": 9999, "started_at": "x"}')  # no pid
    assert discover_sidecar(p) is None


def test_healthy_returns_target(tmp_path: Path) -> None:
    p = tmp_path / "h.json"
    _write(p, port=9999, pid=os.getpid(), token="sek")
    t = discover_sidecar(p, _health_probe=lambda _p: True)
    assert t == SidecarTarget(url="http://127.0.0.1:9999/mcp", token="sek")


def test_healthy_without_token(tmp_path: Path) -> None:
    p = tmp_path / "h.json"
    _write(p, port=9999, pid=os.getpid())
    t = discover_sidecar(p, _health_probe=lambda _p: True)
    assert t == SidecarTarget(url="http://127.0.0.1:9999/mcp", token=None)
