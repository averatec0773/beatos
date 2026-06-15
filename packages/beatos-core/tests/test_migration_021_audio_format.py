import sqlite3

from beatos_core.db import run_migrations


def _seed_pre_021(path):
    """Build a v20-shaped asset table with the format-encoded roles, including a
    track that holds the tagged slot in BOTH wav and mp3, plus a residual literal
    'audio' row — the two cases the rebuild must handle without loss/conflict."""
    c = sqlite3.connect(path)
    c.executescript(
        """
        CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
        CREATE TABLE track (id INTEGER PRIMARY KEY, title TEXT);
        CREATE TABLE asset (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            track_id INTEGER NOT NULL REFERENCES track(id) ON DELETE CASCADE,
            role TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'linked',
            abs_path TEXT NOT NULL, rel_path TEXT, sha256 TEXT, size_bytes INTEGER,
            mime TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            missing INTEGER NOT NULL DEFAULT 0, UNIQUE(track_id, role)
        );
        INSERT INTO track (id, title) VALUES (1, 'A'), (2, 'B');
        INSERT INTO asset (track_id, role, abs_path, created_at, updated_at) VALUES
            (1, 'audio_tagged_wav',   '/m/a.wav',  't', 't'),
            (1, 'audio_tagged_mp3',   '/m/a.mp3',  't', 't'),
            (1, 'audio_untagged_wav', '/m/a2.wav', 't', 't'),
            (1, 'cover',              '/m/a.jpg',  't', 't'),
            (2, 'audio',              '/m/b.wav',  't', 't');
        """
    )
    c.executemany(
        "INSERT INTO schema_version (version, applied_at) VALUES (?, 't')",
        [(v,) for v in range(1, 21)],
    )
    c.commit()
    c.close()


async def test_migration_021_splits_role_and_format(tmp_path):
    db = tmp_path / "global.db"
    _seed_pre_021(db)

    await run_migrations(db)

    c = sqlite3.connect(db)
    rows = sorted(
        c.execute("SELECT track_id, role, format FROM asset ORDER BY track_id, role, format").fetchall()
    )
    # Track 1 keeps BOTH tagged formats (no collapse loss); literal 'audio' -> untagged.
    assert rows == [
        (1, "audio_tagged", "mp3"),
        (1, "audio_tagged", "wav"),
        (1, "audio_untagged", "wav"),
        (1, "cover", ""),
        (2, "audio_untagged", "wav"),
    ]
    assert c.execute("SELECT COUNT(*) FROM asset").fetchone()[0] == 5
    # 021 applied + idempotent re-run is a no-op.
    assert (21,) in c.execute("SELECT version FROM schema_version").fetchall()
    c.close()


async def test_migration_021_is_idempotent(tmp_path):
    db = tmp_path / "global.db"
    _seed_pre_021(db)
    await run_migrations(db)
    await run_migrations(db)  # second pass must not re-run / error
    c = sqlite3.connect(db)
    assert c.execute("SELECT COUNT(*) FROM asset").fetchone()[0] == 5
    c.close()
