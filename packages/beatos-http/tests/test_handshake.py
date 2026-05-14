"""Tests for the port handshake file."""
import json
import os

import pytest

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
    assert "BeatOS" in str(resolved) or "beatos" in str(resolved)
