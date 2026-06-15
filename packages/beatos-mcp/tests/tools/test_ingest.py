"""create_tracks + attach_assets + detach_assets MCP tools."""
import datetime as dt
import json

import aiosqlite
import pytest

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


async def _payload(db_path, token):
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT payload FROM tokens WHERE token=?", (token,)
        ) as cur:
            return json.loads((await cur.fetchone())[0])


# --- create_tracks (unchanged from v0.0.24) ---


@pytest.mark.asyncio
async def test_create_tracks_happy(db_path):
    r = await create_tracks(items=[{"title": "Beat A"}, {"title": "Beat B", "bpm": 140}])
    p = await _payload(db_path, r["token"])
    assert len(p["items"]) == 2
    assert p["items"][0]["title"] == "Beat A"
    assert p["items"][1]["bpm"] == 140
    assert "Beat A" in " · ".join(p["preview"]["sample"])


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


@pytest.mark.asyncio
async def test_attach_assets_happy(db_path, tmp_path):
    items = [
        {"track_id": 1, "role": "audio", "path": _wav(tmp_path, "a1.wav")},
        {"track_id": 2, "role": "cover", "path": _jpg(tmp_path, "a2.jpg")},
    ]
    r = await attach_assets(items=items)
    p = await _payload(db_path, r["token"])
    assert len(p["items"]) == 2
    assert "2 asset" in p["preview"]["headline"]
    assert "2 new" in p["preview"]["headline"]
    assert p["preview"]["warnings"] == []


@pytest.mark.asyncio
async def test_attach_assets_resolves_audio_role_by_extension(db_path, tmp_path):
    """The agent-facing role 'audio' must resolve to a canonical DB role
    (audio_untagged_*) by file extension — storing the literal 'audio' makes the
    asset invisible to playback/analysis/serving."""
    r = await attach_assets(
        items=[
            {"track_id": 1, "role": "audio", "path": _wav(tmp_path, "a.wav")},
            {"track_id": 2, "role": "audio", "path": _mp3(tmp_path, "b.mp3")},
        ]
    )
    p = await _payload(db_path, r["token"])
    assert [it["role"] for it in p["items"]] == [
        "audio_untagged_wav",
        "audio_untagged_mp3",
    ]


@pytest.mark.asyncio
async def test_attach_assets_rejects_unsupported_audio_ext(db_path, tmp_path):
    """Audio extensions with no representable DB role (.flac/.aiff) are rejected
    rather than silently stored as an invalid role."""
    f = tmp_path / "b.flac"
    f.write_bytes(b"fLaC")
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
            "INSERT INTO asset (track_id, role, abs_path, created_at, updated_at) "
            "VALUES (1, 'audio_untagged_wav', '/old.wav', ?, ?)",
            (now, now),
        )
        await conn.commit()
    items = [
        {"track_id": 1, "role": "audio", "path": _wav(tmp_path, "new.wav")},
        {"track_id": 2, "role": "audio", "path": _wav(tmp_path, "fresh.wav")},
    ]
    r = await attach_assets(items=items)
    p = await _payload(db_path, r["token"])
    assert "1 new, 1 replacing" in p["preview"]["headline"]
    assert any("replac" in w.lower() for w in p["preview"]["warnings"])


# --- detach_assets (batch, v0.0.24.2) ---


@pytest.mark.asyncio
async def test_detach_assets_happy(db_path):
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            "INSERT INTO asset (track_id, role, abs_path, created_at, updated_at) "
            "VALUES (1, 'audio_untagged_wav', '/a.wav', ?, ?)",
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
    r = await detach_assets(items=items)
    p = await _payload(db_path, r["token"])
    assert "Detach 2" in p["preview"]["headline"]
    assert "already absent" not in p["preview"]["headline"]


@pytest.mark.asyncio
async def test_detach_assets_idempotent_preview(db_path):
    items = [{"track_id": 1, "role": "audio"}]
    r = await detach_assets(items=items)
    p = await _payload(db_path, r["token"])
    # No asset exists; both the headline and the sample reflect that.
    assert "Detach 0" in p["preview"]["headline"]
    assert "already absent" in p["preview"]["headline"]


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
