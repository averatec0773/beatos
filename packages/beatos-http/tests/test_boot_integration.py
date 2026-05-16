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


def test_sidecar_boots_and_responds_to_health(isolated_env: dict[str, str], tmp_path: Path):
    handshake = Path(isolated_env["BEATOS_HANDSHAKE_PATH"])
    proc = subprocess.Popen(
        [sys.executable, "-m", "beatos_http"],
        env=isolated_env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        deadline = time.time() + 10.0
        while time.time() < deadline:
            if handshake.exists():
                break
            if proc.poll() is not None:
                stdout, stderr = proc.communicate(timeout=1.0)
                pytest.fail(
                    f"sidecar exited early: rc={proc.returncode}\n"
                    f"stdout={stdout.decode()}\nstderr={stderr.decode()}"
                )
            time.sleep(0.05)
        else:
            proc.kill()
            pytest.fail("handshake file never appeared within 10s")

        payload = json.loads(handshake.read_text())
        assert "port" in payload
        port = payload["port"]

        # GET /api/health
        r = httpx.get(f"http://127.0.0.1:{port}/api/health", timeout=5.0)
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3.0)
        except subprocess.TimeoutExpired:
            proc.kill()
