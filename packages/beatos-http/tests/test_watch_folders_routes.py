"""Integration tests for watch folder routes."""
import pathlib
import wave

import pytest
from fastapi.testclient import TestClient

from beatos_core import state
from beatos_http.app import create_app


def _make_wav(path: pathlib.Path) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(44100)
        w.writeframes(b"\x00\x00" * 44100)


@pytest.fixture(autouse=True)
async def _isolate(tmp_path, monkeypatch):
    monkeypatch.setenv("BEATOS_REGISTRY_PATH", str(tmp_path / "known_libraries.json"))
    await state.set_active(None)
    yield
    await state.set_active(None)


def _setup(client: TestClient, tmp_path: pathlib.Path) -> None:
    root = tmp_path / "Lib"
    root.mkdir()
    client.post("/api/libraries/init", json={"path": str(root)})


def test_add_watch_folder_returns_scan_result(tmp_path):
    client = TestClient(create_app())
    _setup(client, tmp_path)
    watch_dir = tmp_path / "exports"
    watch_dir.mkdir()
    _make_wav(watch_dir / "beat.wav")

    res = client.post("/api/watch-folders", json={"path": str(watch_dir)})

    assert res.status_code == 200
    body = res.json()
    assert "folder_id" in body
    assert len(body["found_files"]) == 1


def test_scan_existing_import_all_creates_tracks(tmp_path):
    client = TestClient(create_app())
    _setup(client, tmp_path)
    watch_dir = tmp_path / "exports"
    watch_dir.mkdir()
    _make_wav(watch_dir / "a.wav")
    # Write b.wav with different content so sha256 differs from a.wav
    with wave.open(str(watch_dir / "b.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(44100)
        w.writeframes(b"\x01\x00" * 44100)
    folder_id = client.post("/api/watch-folders", json={"path": str(watch_dir)}).json()["folder_id"]

    res = client.post(
        f"/api/watch-folders/{folder_id}/scan-existing",
        json={"action": "import_all"},
    )

    assert res.status_code == 200
    tracks = client.get("/api/tracks").json()
    assert len(tracks) == 2


def test_delete_watch_folder(tmp_path):
    client = TestClient(create_app())
    _setup(client, tmp_path)
    watch_dir = tmp_path / "exports"
    watch_dir.mkdir()
    folder_id = client.post("/api/watch-folders", json={"path": str(watch_dir)}).json()["folder_id"]

    res = client.delete(f"/api/watch-folders/{folder_id}")

    assert res.status_code == 204
