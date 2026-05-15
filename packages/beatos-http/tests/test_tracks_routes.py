"""Integration tests for /api/tracks routes."""
import pytest
from fastapi.testclient import TestClient

from beatos_core.db import run_migrations
from beatos_http.app import create_app


@pytest.fixture(autouse=True)
async def _fresh_db(tmp_path, monkeypatch):
    """Each test gets its own isolated global DB with migrations applied."""
    db_path = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(db_path))
    await run_migrations(db_path)
    yield


def test_full_crud_flow(tmp_path):
    client = TestClient(create_app())

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
    track_id = client.post("/api/tracks", json={"title": "T"}).json()["id"]

    res = client.put(f"/api/tracks/{track_id}", json={"description_draft": "x"})

    assert res.status_code == 422  # TrackUpdate has extra='forbid'


def test_get_missing_track_returns_404(tmp_path):
    client = TestClient(create_app())

    res = client.get("/api/tracks/99999")

    assert res.status_code == 404
