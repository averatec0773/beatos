import json
import os
from pathlib import Path
from unittest.mock import patch

import pytest

from beatos_mcp.launcher import run_launcher, DiscoveryError


def _write_handshake(path: Path, *, port: int, pid: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({
        "port": port,
        "pid": pid,
        "started_at": "2026-05-19T00:00:00Z",
    }))


def test_missing_handshake_raises(tmp_path: Path) -> None:
    missing = tmp_path / "handshake.json"
    with pytest.raises(DiscoveryError, match="not running"):
        run_launcher(handshake_path=missing, _exec=lambda args: None)


def test_stale_pid_raises(tmp_path: Path) -> None:
    path = tmp_path / "handshake.json"
    # PID 1 exists on every Unix but isn't us; here we use a near-impossible PID
    _write_handshake(path, port=0, pid=2_000_000)
    with pytest.raises(DiscoveryError, match="process not found"):
        run_launcher(handshake_path=path, _exec=lambda args: None)


def test_port_unreachable_raises(tmp_path: Path) -> None:
    path = tmp_path / "handshake.json"
    # Port 1 is reserved/unbindable for non-root; will fail health check
    _write_handshake(path, port=1, pid=os.getpid())
    with pytest.raises(DiscoveryError, match="not responding"):
        run_launcher(
            handshake_path=path,
            _exec=lambda args: None,
            _health_probe=lambda p: False,
        )


def test_malformed_handshake_raises(tmp_path: Path) -> None:
    path = tmp_path / "handshake.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("{ not valid json")
    with pytest.raises(DiscoveryError, match="malformed"):
        run_launcher(handshake_path=path, _exec=lambda args: None)


def test_handshake_missing_pid_raises(tmp_path: Path) -> None:
    path = tmp_path / "handshake.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('{"port": 9999, "started_at": "x"}')  # no pid
    with pytest.raises(DiscoveryError, match="malformed"):
        run_launcher(handshake_path=path, _exec=lambda args: None)


def test_healthy_calls_exec_with_mcp_proxy(tmp_path: Path) -> None:
    path = tmp_path / "handshake.json"
    _write_handshake(path, port=9999, pid=os.getpid())
    captured = []
    run_launcher(
        handshake_path=path,
        _exec=lambda args: captured.append(args),
        _health_probe=lambda p: True,
    )
    assert captured, "exec was not called"
    args = captured[0]
    assert args[0] == "mcp-proxy"
    assert "--transport=streamablehttp" in args
    assert "http://127.0.0.1:9999/mcp" in args
