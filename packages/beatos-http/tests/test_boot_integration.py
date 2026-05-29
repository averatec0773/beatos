"""Integration test: spawn the real sidecar process, verify handshake + /health.

Coverage gap closed: __main__.py (socket bind → handshake write → uvicorn) was
previously untested. All other tests use TestClient which skips this path.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

import httpx
import pytest


@pytest.fixture()
def isolated_env(tmp_path: Path) -> dict[str, str]:
    env = os.environ.copy()
    env["BEATOS_DB_PATH"] = str(tmp_path / "test.db")
    env["BEATOS_HANDSHAKE_PATH"] = str(tmp_path / "handshake.json")
    return env


def _wait_for_handshake_port(proc: subprocess.Popen, handshake: Path, timeout: float = 20.0) -> int:
    """Block until the sidecar writes a handshake with a port (or it dies)."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if handshake.exists():
            try:
                payload = json.loads(handshake.read_text())
            except (json.JSONDecodeError, ValueError):
                # Partial write — the file appeared before the JSON was flushed.
                payload = {}
            if "port" in payload:
                return int(payload["port"])
        if proc.poll() is not None:
            stdout, stderr = proc.communicate(timeout=1.0)
            pytest.fail(
                f"sidecar exited early: rc={proc.returncode}\n"
                f"stdout={stdout.decode()}\nstderr={stderr.decode()}"
            )
        time.sleep(0.05)
    proc.kill()
    pytest.fail(f"handshake with a port never appeared within {timeout:.0f}s")


def _get_health_when_ready(port: int, timeout: float = 20.0) -> httpx.Response:
    """Poll /api/health until the socket actually accepts connections.

    The handshake file is written by our own code and is NOT a guarantee that
    uvicorn is listening yet (a freshly-spawned server has a bind→listen gap —
    see audit B2), so a single GET can race and hit Connection refused. Real
    integration tests must wait for readiness rather than assume it.
    """
    deadline = time.time() + timeout
    last_err: Exception | None = None
    while time.time() < deadline:
        try:
            return httpx.get(f"http://127.0.0.1:{port}/api/health", timeout=2.0)
        except httpx.ConnectError as e:
            last_err = e
            time.sleep(0.1)
    raise AssertionError(f"sidecar never accepted connections on port {port}: {last_err}")


def test_sidecar_boots_and_responds_to_health(isolated_env: dict[str, str], tmp_path: Path):
    handshake = Path(isolated_env["BEATOS_HANDSHAKE_PATH"])
    proc = subprocess.Popen(
        [sys.executable, "-m", "beatos_http"],
        env=isolated_env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        port = _wait_for_handshake_port(proc, handshake)
        r = _get_health_when_ready(port)
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3.0)
        except subprocess.TimeoutExpired:
            proc.kill()


def test_sidecar_boots_when_inject_port_taken(isolated_env: dict[str, str], tmp_path: Path):
    """Graceful degrade: a busy inject fixed port must not block main API boot.

    We pre-occupy an OS-assigned port, point BEATOS_INJECT_PORT at it, then boot
    the sidecar. The inject app's pre-bind contention path returns None and the
    main API still comes up and serves /api/health.
    """
    import socket as _socket

    blocker = _socket.socket(_socket.AF_INET, _socket.SOCK_STREAM)
    blocker.setsockopt(_socket.SOL_SOCKET, _socket.SO_REUSEADDR, 1)
    blocker.bind(("127.0.0.1", 0))
    taken_port = blocker.getsockname()[1]
    blocker.listen()
    try:
        isolated_env["BEATOS_INJECT_PORT"] = str(taken_port)
        handshake = Path(isolated_env["BEATOS_HANDSHAKE_PATH"])
        proc = subprocess.Popen(
            [sys.executable, "-m", "beatos_http"],
            env=isolated_env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        try:
            port = _wait_for_handshake_port(proc, handshake)
            r = _get_health_when_ready(port)
            assert r.status_code == 200
            assert r.json() == {"status": "ok"}
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=3.0)
            except subprocess.TimeoutExpired:
                proc.kill()
    finally:
        blocker.close()


def test_sidecar_writes_jsonl_log(isolated_env: dict[str, str], tmp_path: Path):
    log_path = tmp_path / "sidecar.jsonl"
    isolated_env["BEATOS_LOG_PATH"] = str(log_path)
    handshake = Path(isolated_env["BEATOS_HANDSHAKE_PATH"])

    proc = subprocess.Popen(
        [sys.executable, "-m", "beatos_http"],
        env=isolated_env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        port = _wait_for_handshake_port(proc, handshake)
        r = _get_health_when_ready(port)
        assert r.status_code == 200

        time.sleep(0.3)  # let RotatingFileHandler flush
        assert log_path.exists(), f"sidecar did not write JSONL at {log_path}"
        lines = log_path.read_text().strip().splitlines()
        assert len(lines) >= 1, "JSONL file empty"
        entry = json.loads(lines[0])
        assert "level" in entry
        assert "ts" in entry
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3.0)
        except subprocess.TimeoutExpired:
            proc.kill()
