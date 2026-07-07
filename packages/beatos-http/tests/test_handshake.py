"""Tests for the port handshake file."""
import json
import os


from beatos_http.handshake import (
    default_handshake_path,
    read_handshake,
    write_handshake,
)


def test_write_handshake_creates_json(tmp_path, monkeypatch):
    path = tmp_path / "handshake.json"

    write_handshake(port=54321, path=path)

    payload = json.loads(path.read_text())
    assert payload["port"] == 54321
    assert "started_at" in payload


def test_read_handshake_round_trips(tmp_path):
    path = tmp_path / "handshake.json"
    write_handshake(port=12345, path=path)

    parsed = read_handshake(path)

    assert parsed.port == 12345


def test_default_path_respects_env_override(tmp_path, monkeypatch):
    target = tmp_path / "custom" / "h.json"
    monkeypatch.setenv("BEATOS_HANDSHAKE_PATH", str(target))

    resolved = default_handshake_path()

    assert resolved == target


def test_default_path_falls_back_to_runtime_dir(tmp_path, monkeypatch):
    monkeypatch.delenv("BEATOS_HANDSHAKE_PATH", raising=False)

    resolved = default_handshake_path()

    assert resolved.name == "handshake.json"
    assert "beatos" in str(resolved).lower()


def test_default_handshake_path_macos_matches_electron_userdata():
    """Electron's userData dir is `beatos-desktop` (Electron productName).
    The Python default must match so the launcher reads from where the
    Electron-spawned sidecar writes."""
    import sys
    if sys.platform != "darwin":
        return  # Linux/Windows have their own conventions
    from pathlib import Path
    expected = Path.home() / "Library" / "Application Support" / "beatos-desktop" / "runtime" / "handshake.json"
    p = default_handshake_path()
    assert p == expected, f"got {p}, expected {expected}"


def test_handshake_includes_pid(tmp_path):
    path = tmp_path / "handshake.json"
    write_handshake(port=54321, path=path)

    data = json.loads(path.read_text())
    assert data["port"] == 54321
    assert data["pid"] == os.getpid()
    assert "started_at" in data


def test_read_handshake_returns_pid(tmp_path):
    path = tmp_path / "handshake.json"
    write_handshake(port=54321, path=path)

    hs = read_handshake(path)
    assert hs.port == 54321
    assert hs.pid == os.getpid()
