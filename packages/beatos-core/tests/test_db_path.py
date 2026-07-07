import sys
from pathlib import Path

from beatos_core.db import (
    legacy_db_path,
    migrate_legacy_db_if_needed,
    resolve_db_path,
)


def test_env_var_overrides_default(tmp_path, monkeypatch):
    custom = tmp_path / "custom.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(custom))
    assert resolve_db_path() == custom


def test_default_when_env_absent(monkeypatch):
    # v0.0.50+: default lives in the per-OS app-data dir (off cloud-synced
    # ~/Music), matching the dev-Electron userData dir "beatos-desktop".
    monkeypatch.delenv("BEATOS_DB_PATH", raising=False)
    if sys.platform == "darwin":
        expected = (
            Path.home() / "Library" / "Application Support" / "beatos-desktop" / "global.db"
        )
        assert resolve_db_path() == expected
    elif sys.platform.startswith("win"):
        got = resolve_db_path()
        assert got.name == "global.db" and got.parent.name == "beatos-desktop"
    else:
        monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
        expected = Path.home() / ".config" / "beatos-desktop" / "global.db"
        assert resolve_db_path() == expected


def test_legacy_path_is_the_old_music_dir():
    assert legacy_db_path() == Path.home() / "Music" / "BeatOS" / "global.db"


# --- one-time legacy migration (web/standalone mode) ---


def _wire_paths(monkeypatch, tmp_path):
    legacy = tmp_path / "old" / "global.db"
    target = tmp_path / "new" / "global.db"
    monkeypatch.delenv("BEATOS_DB_PATH", raising=False)
    monkeypatch.setattr("beatos_core.db.legacy_db_path", lambda: legacy)
    monkeypatch.setattr("beatos_core.db.resolve_db_path", lambda: target)
    return legacy, target


def test_migrates_legacy_db_with_wal_sidecar(tmp_path, monkeypatch):
    legacy, target = _wire_paths(monkeypatch, tmp_path)
    legacy.parent.mkdir(parents=True)
    legacy.write_bytes(b"db-bytes")
    Path(str(legacy) + "-wal").write_bytes(b"wal-bytes")

    assert migrate_legacy_db_if_needed() is True
    assert target.read_bytes() == b"db-bytes"
    assert Path(str(target) + "-wal").read_bytes() == b"wal-bytes"
    # COPY, never move — the legacy file stays as a backup.
    assert legacy.exists()


def test_no_migration_when_env_override_set(tmp_path, monkeypatch):
    legacy, target = _wire_paths(monkeypatch, tmp_path)
    legacy.parent.mkdir(parents=True)
    legacy.write_bytes(b"db-bytes")
    monkeypatch.setenv("BEATOS_DB_PATH", str(tmp_path / "explicit.db"))

    assert migrate_legacy_db_if_needed() is False
    assert not target.exists()


def test_no_migration_when_target_already_exists(tmp_path, monkeypatch):
    legacy, target = _wire_paths(monkeypatch, tmp_path)
    legacy.parent.mkdir(parents=True)
    legacy.write_bytes(b"old")
    target.parent.mkdir(parents=True)
    target.write_bytes(b"current")

    assert migrate_legacy_db_if_needed() is False
    assert target.read_bytes() == b"current"


def test_no_migration_when_no_legacy_db(tmp_path, monkeypatch):
    _, target = _wire_paths(monkeypatch, tmp_path)
    assert migrate_legacy_db_if_needed() is False
    assert not target.exists()
