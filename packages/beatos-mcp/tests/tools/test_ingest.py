"""create_tracks + attach_assets + detach_assets MCP tools — apply directly (L1)."""
import datetime as dt

import aiosqlite
import pytest

import beatos_http.handlers  # noqa: F401 — registers the apply handlers
from beatos_core.agent_log import list_agent_actions
from beatos_core.db import run_migrations
from beatos_mcp.tools.ingest import attach_assets, create_tracks, detach_assets


@pytest.fixture
async def db_path(tmp_path, monkeypatch):
    p = tmp_path / "t.db"
    await run_migrations(p)
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(p) as conn:
        await conn.execute(
            "INSERT INTO track (id, title, created_at, updated_at) VALUES (1, 'Existing', ?, ?)",
            (now, now),
        )
        await conn.execute(
            "INSERT INTO track (id, title, created_at, updated_at) VALUES (2, 'Second', ?, ?)",
            (now, now),
        )
        await conn.commit()
    return p


async def _latest_summary(db_path) -> dict:
    """The preview now lives in the audit log summary (no more token payload)."""
    async with aiosqlite.connect(db_path) as conn:
        rows = await list_agent_actions(conn, limit=1)
    return rows[0]["summary"]


# --- create_tracks ---


@pytest.mark.asyncio
async def test_create_tracks_happy(db_path):
    res = await create_tracks(items=[{"title": "Beat A"}, {"title": "Beat B", "bpm": 140}])
    assert res["status"] == "applied"
    created = res["result"]["created_ids"]
    assert len(created) == 2
    summ = await _latest_summary(db_path)
    assert "Beat A" in " · ".join(summ["sample"])
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT title, bpm FROM track WHERE id IN ({}) ORDER BY id".format(
                ",".join(str(i) for i in created)
            )
        ) as cur:
            rows = await cur.fetchall()
    titles = {r[0] for r in rows}
    assert {"Beat A", "Beat B"} <= titles
    assert 140 in [r[1] for r in rows]


@pytest.mark.asyncio
async def test_create_tracks_rejects_empty(db_path):
    with pytest.raises(ValueError):
        await create_tracks(items=[])


@pytest.mark.asyncio
async def test_create_tracks_rejects_missing_title(db_path):
    with pytest.raises(ValueError, match="title"):
        await create_tracks(items=[{"bpm": 100}])  # type: ignore[list-item]


@pytest.mark.asyncio
async def test_create_tracks_caps_at_100(db_path):
    with pytest.raises(ValueError, match="100"):
        await create_tracks(items=[{"title": f"#{i}"} for i in range(101)])


@pytest.mark.asyncio
async def test_create_tracks_rejects_unknown_field(db_path):
    with pytest.raises(ValueError, match="unknown"):
        await create_tracks(items=[{"title": "x", "frobnicate": True}])  # type: ignore[list-item]


@pytest.mark.asyncio
async def test_create_tracks_rejects_bool_bpm(db_path):
    """Python bool is int subclass; reject it explicitly."""
    with pytest.raises(ValueError, match="bpm"):
        await create_tracks(items=[{"title": "X", "bpm": True}])


# --- attach_assets (batch, v0.0.24.2) ---


def _wav(tmp_path, name="b.wav"):
    f = tmp_path / name
    f.write_bytes(b"RIFF\x00\x00\x00\x00WAVEfmt ")
    return str(f)


def _mp3(tmp_path, name="b.mp3"):
    f = tmp_path / name
    f.write_bytes(b"ID3\x03\x00\x00\x00")
    return str(f)


def _jpg(tmp_path, name="c.jpg"):
    f = tmp_path / name
    f.write_bytes(b"\xff\xd8\xff\xe0")
    return str(f)


def _zip(tmp_path, name="stems.zip"):
    f = tmp_path / name
    f.write_bytes(b"PK\x03\x04")
    return str(f)


@pytest.mark.asyncio
async def test_attach_assets_happy(db_path, tmp_path):
    items = [
        {"track_id": 1, "role": "audio", "path": _wav(tmp_path, "a1.wav")},
        {"track_id": 2, "role": "cover", "path": _jpg(tmp_path, "a2.jpg")},
    ]
    res = await attach_assets(items=items)
    assert res["status"] == "applied"
    results = res["result"]["results"]
    assert len(results) == 2
    assert all(r["replaced"] is False for r in results)
    summ = await _latest_summary(db_path)
    assert "2 asset" in summ["headline"]
    assert "2 new" in summ["headline"]
    assert summ["warnings"] == []


@pytest.mark.asyncio
async def test_attach_assets_resolves_audio_role_by_extension(db_path, tmp_path):
    """The agent-facing role 'audio' must resolve to the semantic untagged role +
    a format derived from the extension — storing the literal 'audio' makes the
    asset invisible to playback/analysis/serving."""
    res = await attach_assets(
        items=[
            {"track_id": 1, "role": "audio", "path": _wav(tmp_path, "a.wav")},
            {"track_id": 2, "role": "audio", "path": _mp3(tmp_path, "b.mp3")},
        ]
    )
    results = sorted(res["result"]["results"], key=lambda r: r["track_id"])
    assert [(r["role"], r["format"]) for r in results] == [
        ("audio_untagged", "wav"),
        ("audio_untagged", "mp3"),
    ]
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT track_id, role, format FROM asset ORDER BY track_id"
        ) as cur:
            rows = await cur.fetchall()
    assert rows == [(1, "audio_untagged", "wav"), (2, "audio_untagged", "mp3")]


@pytest.mark.asyncio
async def test_attach_assets_accepts_flac(db_path, tmp_path):
    """flac is a supported format now and resolves to (audio_untagged, flac)."""
    f = tmp_path / "b.flac"
    f.write_bytes(b"fLaC")
    res = await attach_assets(items=[{"track_id": 1, "role": "audio", "path": str(f)}])
    r = res["result"]["results"][0]
    assert (r["role"], r["format"]) == ("audio_untagged", "flac")


@pytest.mark.asyncio
async def test_attach_assets_rejects_unsupported_audio_ext(db_path, tmp_path):
    """Audio extensions with no supported format (.aiff/.m4a) are rejected rather
    than silently stored."""
    f = tmp_path / "b.aiff"
    f.write_bytes(b"FORM")
    with pytest.raises(ValueError, match="extension"):
        await attach_assets(items=[{"track_id": 1, "role": "audio", "path": str(f)}])


@pytest.mark.asyncio
async def test_attach_assets_empty(db_path):
    with pytest.raises(ValueError, match="non-empty"):
        await attach_assets(items=[])


@pytest.mark.asyncio
async def test_attach_assets_caps_at_500(db_path, tmp_path):
    f = _wav(tmp_path, "x.wav")
    items = [{"track_id": 1, "role": "audio", "path": f}] * 501
    with pytest.raises(ValueError, match="500"):
        await attach_assets(items=items)


@pytest.mark.asyncio
async def test_attach_assets_rejects_missing_track(db_path, tmp_path):
    items = [{"track_id": 999, "role": "audio", "path": _wav(tmp_path)}]
    with pytest.raises(ValueError, match="not found"):
        await attach_assets(items=items)


@pytest.mark.asyncio
async def test_attach_assets_rejects_missing_file(db_path):
    items = [{"track_id": 1, "role": "audio", "path": "/no/such/file.wav"}]
    with pytest.raises(ValueError, match="file not found"):
        await attach_assets(items=items)


@pytest.mark.asyncio
async def test_attach_assets_rejects_bad_extension(db_path, tmp_path):
    f = tmp_path / "b.txt"
    f.write_text("nope")
    items = [{"track_id": 1, "role": "audio", "path": str(f)}]
    with pytest.raises(ValueError, match="extension"):
        await attach_assets(items=items)


@pytest.mark.asyncio
async def test_attach_assets_rejects_relative_path(db_path, tmp_path):
    rel = "./relative.wav"
    items = [{"track_id": 1, "role": "audio", "path": rel}]
    with pytest.raises(ValueError, match="absolute"):
        await attach_assets(items=items)


@pytest.mark.asyncio
async def test_attach_assets_rejects_duplicate_pairs(db_path, tmp_path):
    f = _wav(tmp_path)
    items = [
        {"track_id": 1, "role": "audio", "path": f},
        {"track_id": 1, "role": "audio", "path": f},
    ]
    with pytest.raises(ValueError, match="duplicate"):
        await attach_assets(items=items)


@pytest.mark.asyncio
async def test_attach_assets_rejects_bool_track_id(db_path, tmp_path):
    items = [{"track_id": True, "role": "audio", "path": _wav(tmp_path)}]
    with pytest.raises(ValueError, match="track_id"):
        await attach_assets(items=items)


@pytest.mark.asyncio
async def test_attach_assets_rejects_bad_role(db_path, tmp_path):
    items = [{"track_id": 1, "role": "bogus", "path": _wav(tmp_path)}]
    with pytest.raises(ValueError, match="role"):
        await attach_assets(items=items)


@pytest.mark.asyncio
async def test_attach_assets_rejects_missing_fields(db_path, tmp_path):
    items = [{"track_id": 1, "role": "audio"}]  # no path
    with pytest.raises(ValueError, match="missing fields"):
        await attach_assets(items=items)


@pytest.mark.asyncio
async def test_attach_assets_rejects_unknown_fields(db_path, tmp_path):
    items = [
        {
            "track_id": 1,
            "role": "audio",
            "path": _wav(tmp_path),
            "extra": "nope",
        }
    ]
    with pytest.raises(ValueError, match="unknown"):
        await attach_assets(items=items)


@pytest.mark.asyncio
async def test_attach_assets_classifies_replacements(db_path, tmp_path):
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            "INSERT INTO asset (track_id, role, format, abs_path, created_at, updated_at) "
            "VALUES (1, 'audio_untagged', 'wav', '/old.wav', ?, ?)",
            (now, now),
        )
        await conn.commit()
    items = [
        {"track_id": 1, "role": "audio", "path": _wav(tmp_path, "new.wav")},
        {"track_id": 2, "role": "audio", "path": _wav(tmp_path, "fresh.wav")},
    ]
    res = await attach_assets(items=items)
    by_track = {r["track_id"]: r["replaced"] for r in res["result"]["results"]}
    assert by_track == {1: True, 2: False}
    summ = await _latest_summary(db_path)
    assert "1 new, 1 replacing" in summ["headline"]
    assert any("replac" in w.lower() for w in summ["warnings"])


# --- stems role (QA P1-4) ---


@pytest.mark.asyncio
async def test_attach_assets_stems_zip(db_path, tmp_path):
    """QA P1-4: role='stems' stores under canonical role 'stems' with format=''
    (one stems slot per track) and accepts a .zip bundle."""
    res = await attach_assets(
        items=[{"track_id": 1, "role": "stems", "path": _zip(tmp_path)}]
    )
    assert res["status"] == "applied"
    r = res["result"]["results"][0]
    assert (r["role"], r["format"]) == ("stems", "")
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT track_id, role, format FROM asset WHERE track_id=1"
        ) as cur:
            rows = await cur.fetchall()
    assert rows == [(1, "stems", "")]


@pytest.mark.asyncio
async def test_attach_assets_stems_accepts_wav(db_path, tmp_path):
    """A single multitrack .wav is also accepted as stems (no format recorded)."""
    res = await attach_assets(
        items=[{"track_id": 1, "role": "stems", "path": _wav(tmp_path, "s.wav")}]
    )
    r = res["result"]["results"][0]
    assert (r["role"], r["format"]) == ("stems", "")


@pytest.mark.asyncio
async def test_attach_assets_stems_rejects_bad_ext(db_path, tmp_path):
    f = tmp_path / "s.txt"
    f.write_text("nope")
    with pytest.raises(ValueError, match="extension"):
        await attach_assets(items=[{"track_id": 1, "role": "stems", "path": str(f)}])


@pytest.mark.asyncio
async def test_attach_assets_stems_one_slot_replaces(db_path, tmp_path):
    """Only one stems slot per track: a second attach replaces in place."""
    await attach_assets(items=[{"track_id": 1, "role": "stems", "path": _zip(tmp_path, "v1.zip")}])
    res = await attach_assets(
        items=[{"track_id": 1, "role": "stems", "path": _zip(tmp_path, "v2.zip")}]
    )
    assert res["result"]["results"][0]["replaced"] is True
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT COUNT(*) FROM asset WHERE track_id=1 AND role='stems'") as cur:
            assert (await cur.fetchone())[0] == 1


@pytest.mark.asyncio
async def test_detach_assets_stems(db_path, tmp_path):
    await attach_assets(items=[{"track_id": 1, "role": "stems", "path": _zip(tmp_path)}])
    res = await detach_assets(items=[{"track_id": 1, "role": "stems"}])
    assert res["result"]["results"][0]["removed"] is True
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT COUNT(*) FROM asset WHERE track_id=1 AND role='stems'") as cur:
            assert (await cur.fetchone())[0] == 0


@pytest.mark.asyncio
async def test_detach_audio_does_not_remove_stems(db_path, tmp_path):
    """The agent-facing 'audio' detach expands to audio roles only — it must not
    sweep the stems bundle."""
    await attach_assets(
        items=[
            {"track_id": 1, "role": "audio", "path": _wav(tmp_path, "a.wav")},
            {"track_id": 1, "role": "stems", "path": _zip(tmp_path)},
        ]
    )
    await detach_assets(items=[{"track_id": 1, "role": "audio"}])
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT role FROM asset WHERE track_id=1") as cur:
            roles = {r[0] for r in await cur.fetchall()}
    assert roles == {"stems"}


# --- detach_assets (batch, v0.0.24.2) ---


@pytest.mark.asyncio
async def test_detach_assets_happy(db_path):
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            "INSERT INTO asset (track_id, role, format, abs_path, created_at, updated_at) "
            "VALUES (1, 'audio_untagged', 'wav', '/a.wav', ?, ?)",
            (now, now),
        )
        await conn.execute(
            "INSERT INTO asset (track_id, role, abs_path, created_at, updated_at) "
            "VALUES (1, 'cover', '/c.jpg', ?, ?)",
            (now, now),
        )
        await conn.commit()
    items = [
        {"track_id": 1, "role": "audio"},
        {"track_id": 1, "role": "cover"},
    ]
    res = await detach_assets(items=items)
    assert res["status"] == "applied"
    assert all(r["removed"] is True for r in res["result"]["results"])
    summ = await _latest_summary(db_path)
    assert "Detach 2" in summ["headline"]
    assert "already absent" not in summ["headline"]
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT COUNT(*) FROM asset") as cur:
            assert (await cur.fetchone())[0] == 0


@pytest.mark.asyncio
async def test_detach_assets_idempotent_preview(db_path):
    items = [{"track_id": 1, "role": "audio"}]
    res = await detach_assets(items=items)
    # No asset exists; the apply reports removed=False, no DB change.
    assert res["result"]["results"][0]["removed"] is False
    summ = await _latest_summary(db_path)
    assert "Detach 0" in summ["headline"]
    assert "already absent" in summ["headline"]


@pytest.mark.asyncio
async def test_detach_assets_rejects_empty(db_path):
    with pytest.raises(ValueError, match="non-empty"):
        await detach_assets(items=[])


@pytest.mark.asyncio
async def test_detach_assets_caps_at_500(db_path):
    items = [{"track_id": 1, "role": "audio"}] * 501
    with pytest.raises(ValueError, match="500"):
        await detach_assets(items=items)


@pytest.mark.asyncio
async def test_detach_assets_rejects_duplicate_pairs(db_path):
    items = [
        {"track_id": 1, "role": "audio"},
        {"track_id": 1, "role": "audio"},
    ]
    with pytest.raises(ValueError, match="duplicate"):
        await detach_assets(items=items)


@pytest.mark.asyncio
async def test_detach_assets_rejects_bad_role(db_path):
    items = [{"track_id": 1, "role": "bogus"}]
    with pytest.raises(ValueError, match="role"):
        await detach_assets(items=items)


@pytest.mark.asyncio
async def test_detach_assets_rejects_unknown_fields(db_path):
    items = [{"track_id": 1, "role": "audio", "path": "/x"}]
    with pytest.raises(ValueError, match="unknown"):
        await detach_assets(items=items)
