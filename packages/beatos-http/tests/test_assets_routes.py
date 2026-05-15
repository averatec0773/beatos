"""Integration tests for asset routes."""
import pathlib
import wave

import pytest
from fastapi.testclient import TestClient

from beatos_core.db import run_migrations
from beatos_core.sources.models import SourceCreate
from beatos_core.sources.service import create_source
from beatos_http.app import create_app


def _make_wav(path: pathlib.Path, duration_seconds: float = 2.0) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(44100)
        w.writeframes(b"\x00\x00" * int(duration_seconds * 44100))


@pytest.fixture(autouse=True)
async def _fresh_db(tmp_path, monkeypatch):
    """Each test gets its own isolated global DB with migrations applied.
    Registers tmp_path as a Source so attach_asset's OutOfSourceError guard
    is satisfied.
    """
    db_path = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(db_path))
    await run_migrations(db_path)
    await create_source(SourceCreate(root_path=str(tmp_path)))
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


def test_move_managed_returns_501(tmp_path):
    client = TestClient(create_app())
    track_id = _create_track(client)
    audio = tmp_path / "beat.wav"
    _make_wav(audio)
    asset_id = client.post(
        f"/api/tracks/{track_id}/assets", json={"role": "audio_tagged_mp3", "path": str(audio)}
    ).json()["id"]

    res = client.post(f"/api/tracks/{track_id}/assets/{asset_id}/move")

    assert res.status_code == 501


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
