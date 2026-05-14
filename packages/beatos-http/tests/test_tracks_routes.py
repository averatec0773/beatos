"""Integration tests for /api/tracks routes."""
import pathlib

import pytest
from fastapi.testclient import TestClient

from beatos_core import state
from beatos_http.app import create_app


@pytest.fixture(autouse=True)
async def _isolate(tmp_path, monkeypatch):
    monkeypatch.setenv("BEATOS_REGISTRY_PATH", str(tmp_path / "known_libraries.json"))
    await state.set_active(None)
    yield
    await state.set_active(None)


def _activate(client: TestClient, tmp_path: pathlib.Path) -> None:
    root = tmp_path / "Lib"
    root.mkdir()
    client.post("/api/libraries/init", json={"path": str(root)})


def test_create_track_without_active_returns_409(tmp_path):
    client = TestClient(create_app())

    res = client.post("/api/tracks", json={"title": "Untitled"})

    assert res.status_code == 409


def test_full_crud_flow(tmp_path):
    client = TestClient(create_app())
    _activate(client, tmp_path)

    create_res = client.post("/api/tracks", json={"title": "Untitled"})
    assert create_res.status_code == 200
    track_id = create_res.json()["id"]

    list_res = client.get("/api/tracks")
    assert list_res.status_code == 200
    assert len(list_res.json()) == 1

    get_res = client.get(f"/api/tracks/{track_id}")
    assert get_res.status_code == 200
    assert get_res.json()["title"] == "Untitled"

    update_res = client.put(f"/api/tracks/{track_id}", json={"bpm": 140})
    assert update_res.status_code == 200
    assert update_res.json()["bpm"] == 140
    assert update_res.json()["title"] == "Untitled"

    delete_res = client.delete(f"/api/tracks/{track_id}")
    assert delete_res.status_code == 204

    final_list = client.get("/api/tracks")
    assert final_list.json() == []


def test_update_rejects_description_draft(tmp_path):
    client = TestClient(create_app())
    _activate(client, tmp_path)
    track_id = client.post("/api/tracks", json={"title": "T"}).json()["id"]

    res = client.put(f"/api/tracks/{track_id}", json={"description_draft": "x"})

    assert res.status_code == 422  # TrackUpdate has extra='forbid'
