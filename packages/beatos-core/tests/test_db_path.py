import os
from pathlib import Path

from beatos_core.db import resolve_db_path


def test_env_var_overrides_default(tmp_path, monkeypatch):
    custom = tmp_path / "custom.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(custom))
    assert resolve_db_path() == custom


def test_default_when_env_absent(monkeypatch):
    monkeypatch.delenv("BEATOS_DB_PATH", raising=False)
    expected = Path.home() / "Music" / "BeatOS" / "global.db"
    assert resolve_db_path() == expected
