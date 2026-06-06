"""Integration tests for asset routes."""
import pathlib
import wave

import pytest
from fastapi.testclient import TestClient

from beatos_core.db import run_migrations
from beatos_http.app import create_app


def _make_wav(path: pathlib.Path, duration_seconds: float = 2.0) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(44100)
        w.writeframes(b"\x00\x00" * int(duration_seconds * 44100))


@pytest.fixture(autouse=True)
async def _fresh_db(tmp_path, monkeypatch):
    """Each test gets its own isolated global DB with migrations applied."""
    db_path = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(db_path))
    await run_migrations(db_path)
    yield


def _create_track(client: TestClient) -> int:
    return client.post("/api/tracks", json={"title": "T"}).json()["id"]


def test_attach_audio_returns_asset(tmp_path):
    client = TestClient(create_app())
    track_id = _create_track(client)
    audio = tmp_path / "beat.wav"
    _make_wav(audio)

    res = client.post(f"/api/tracks/{track_id}/assets", json={"role": "audio_tagged_mp3", "path": str(audio)})

    assert res.status_code == 200
    body = res.json()
    assert body["role"] == "audio_tagged_mp3"
    assert body["mode"] == "linked"
    assert body["sha256"]


def test_attach_rejects_duplicate_role(tmp_path):
    client = TestClient(create_app())
    track_id = _create_track(client)
    audio = tmp_path / "beat.wav"
    _make_wav(audio)
    client.post(f"/api/tracks/{track_id}/assets", json={"role": "audio_tagged_mp3", "path": str(audio)})

    res = client.post(f"/api/tracks/{track_id}/assets", json={"role": "audio_tagged_mp3", "path": str(audio)})

    assert res.status_code == 409


def test_detach_returns_204(tmp_path):
    client = TestClient(create_app())
    track_id = _create_track(client)
    audio = tmp_path / "beat.wav"
    _make_wav(audio)
    asset_id = client.post(
        f"/api/tracks/{track_id}/assets", json={"role": "audio_tagged_mp3", "path": str(audio)}
    ).json()["id"]

    res = client.delete(f"/api/tracks/{track_id}/assets/{asset_id}")

    assert res.status_code == 204


def test_relocate_sha256_match_silent_relink(tmp_path):
    client = TestClient(create_app())
    track_id = _create_track(client)
    audio = tmp_path / "beat.wav"
    _make_wav(audio)
    asset_id = client.post(
        f"/api/tracks/{track_id}/assets", json={"role": "audio_tagged_mp3", "path": str(audio)}
    ).json()["id"]
    new_loc = tmp_path / "renamed.wav"
    audio.rename(new_loc)

    res = client.post(
        f"/api/tracks/{track_id}/assets/{asset_id}/relocate",
        json={"new_path": str(new_loc)},
    )

    assert res.status_code == 200
    assert res.json()["abs_path"] == str(new_loc.resolve())


def test_relocate_sha256_mismatch_returns_409(tmp_path):
    client = TestClient(create_app())
    track_id = _create_track(client)
    audio = tmp_path / "beat.wav"
    _make_wav(audio)
    asset_id = client.post(
        f"/api/tracks/{track_id}/assets", json={"role": "audio_tagged_mp3", "path": str(audio)}
    ).json()["id"]
    different = tmp_path / "different.wav"
    _make_wav(different, duration_seconds=5.0)

    res = client.post(
        f"/api/tracks/{track_id}/assets/{asset_id}/relocate",
        json={"new_path": str(different)},
    )

    assert res.status_code == 409


def test_sweep_marks_missing(tmp_path):
    client = TestClient(create_app())
    track_id = _create_track(client)
    audio = tmp_path / "beat.wav"
    _make_wav(audio)
    client.post(f"/api/tracks/{track_id}/assets", json={"role": "audio_tagged_mp3", "path": str(audio)})
    audio.unlink()

    res = client.post("/api/sweep/assets")

    assert res.status_code == 200
    assert res.json()["marked_missing"] == 1


def _make_jpg(path: pathlib.Path) -> None:
    # Minimal valid-ish bytes — attach only needs the file to exist; mime is guessed
    # from the extension. We do not inspect image bytes.
    path.write_bytes(b"\xff\xd8\xff\xe0")


def test_attach_with_replace_true_swaps(tmp_path):
    """replace=true atomically swaps an existing role row."""
    client = TestClient(create_app())
    track_id = _create_track(client)
    cover_a = tmp_path / "a.jpg"
    cover_b = tmp_path / "b.jpg"
    _make_jpg(cover_a)
    _make_jpg(cover_b)

    r1 = client.post(
        f"/api/tracks/{track_id}/assets",
        json={"role": "cover", "path": str(cover_a)},
    )
    assert r1.status_code == 200
    first_id = r1.json()["id"]

    r2 = client.post(
        f"/api/tracks/{track_id}/assets?replace=true",
        json={"role": "cover", "path": str(cover_b)},
    )
    assert r2.status_code == 200
    second = r2.json()
    assert second["abs_path"] == str(cover_b.resolve())
    assert second["id"] != first_id  # old row was deleted, new one inserted


def test_attach_accepts_arbitrary_absolute_path(tmp_path):
    """Attach succeeds for any absolute path, regardless of containing directory."""
    client = TestClient(create_app())
    track_id = _create_track(client)
    outside_dir = tmp_path.parent / "outside-tmp"
    outside_dir.mkdir(exist_ok=True)
    rogue = outside_dir / "outside.wav"
    _make_wav(rogue)

    res = client.post(
        f"/api/tracks/{track_id}/assets",
        json={"role": "audio_tagged_mp3", "path": str(rogue)},
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["abs_path"] == str(rogue.resolve())


# ---------------------------------------------------------------------------
# /api/assets/audio/{id} — Phase 2
# ---------------------------------------------------------------------------


def test_audio_endpoint_returns_file(tmp_path):
    client = TestClient(create_app())
    track_id = _create_track(client)
    wav = tmp_path / "beat.wav"
    _make_wav(wav)
    asset_id = client.post(
        f"/api/tracks/{track_id}/assets",
        json={"role": "audio_tagged_wav", "path": str(wav)},
    ).json()["id"]

    res = client.get(f"/api/assets/audio/{asset_id}")

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("audio/")
    assert int(res.headers["content-length"]) > 0


def test_audio_endpoint_404_for_unknown():
    client = TestClient(create_app())

    res = client.get("/api/assets/audio/999999")

    assert res.status_code == 404


def test_audio_endpoint_rejects_non_audio_asset(tmp_path):
    client = TestClient(create_app())
    track_id = _create_track(client)
    cover = tmp_path / "cover.jpg"
    _make_jpg(cover)
    asset_id = client.post(
        f"/api/tracks/{track_id}/assets",
        json={"role": "cover", "path": str(cover)},
    ).json()["id"]

    res = client.get(f"/api/assets/audio/{asset_id}")

    assert res.status_code == 400


def test_audio_endpoint_supports_range(tmp_path):
    client = TestClient(create_app())
    track_id = _create_track(client)
    wav = tmp_path / "beat.wav"
    _make_wav(wav)
    asset_id = client.post(
        f"/api/tracks/{track_id}/assets",
        json={"role": "audio_tagged_wav", "path": str(wav)},
    ).json()["id"]

    res = client.get(
        f"/api/assets/audio/{asset_id}",
        headers={"Range": "bytes=0-1023"},
    )

    assert res.status_code == 206
    assert "content-range" in {k.lower() for k in res.headers.keys()}
    assert res.headers["content-range"].startswith("bytes ")


def _make_dirty_wav(path: pathlib.Path) -> None:
    """A WAV with a JUNK chunk before fmt and a trailing cue chunk — the shape
    Chromium rejects and the server must sanitize."""
    import struct

    def chunk(cid: bytes, body: bytes) -> bytes:
        pad = b"\x00" if (len(body) & 1) else b""
        return cid + struct.pack("<I", len(body)) + body + pad

    fmt = struct.pack("<HHIIHH", 1, 1, 44100, 44100 * 2, 2, 16)
    audio = b"\x11\x22\x33\x44" * 64
    body = b"WAVE" + chunk(b"JUNK", b"\x00" * 12) + chunk(b"fmt ", fmt) + chunk(b"data", audio) + chunk(b"cue ", b"\x00" * 4)
    path.write_bytes(b"RIFF" + struct.pack("<I", len(body)) + body)


def test_audio_endpoint_repairs_dirty_wav(tmp_path):
    client = TestClient(create_app())
    track_id = _create_track(client)
    wav = tmp_path / "dirty.wav"
    _make_dirty_wav(wav)
    asset_id = client.post(
        f"/api/tracks/{track_id}/assets",
        json={"role": "audio_tagged_wav", "path": str(wav)},
    ).json()["id"]

    res = client.get(f"/api/assets/audio/{asset_id}")

    assert res.status_code == 200
    assert res.headers["content-type"] == "audio/wav"
    assert res.content[0:4] == b"RIFF"
    assert b"JUNK" not in res.content
    assert b"cue " not in res.content
    assert len(res.content) < wav.stat().st_size
