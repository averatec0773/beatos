"""Integration tests for /api/sources routes."""
from __future__ import annotations

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


def test_create_and_list_source(tmp_path):
    client = TestClient(create_app())
    folder = tmp_path / "beats"
    folder.mkdir()

    r = client.post("/api/sources", json={"root_path": str(folder)})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "beats"
    assert body["root_path"] == str(folder.resolve())

    r = client.get("/api/sources")
    assert r.status_code == 200
    arr = r.json()
    assert len(arr) == 1
    assert arr[0]["status"] == "online"
    assert arr[0]["track_count"] == 0


def test_create_source_conflict(tmp_path):
    client = TestClient(create_app())
    folder = tmp_path / "beats"
    folder.mkdir()
    r1 = client.post("/api/sources", json={"root_path": str(folder)})
    assert r1.status_code == 201

    r2 = client.post("/api/sources", json={"root_path": str(folder)})
    assert r2.status_code == 409


def test_create_source_400_on_invalid_path(tmp_path):
    client = TestClient(create_app())
    missing = tmp_path / "does-not-exist"

    r = client.post("/api/sources", json={"root_path": str(missing)})

    assert r.status_code == 400


def test_patch_source_rename(tmp_path):
    client = TestClient(create_app())
    folder = tmp_path / "beats"
    folder.mkdir()
    sid = client.post("/api/sources", json={"root_path": str(folder)}).json()["id"]

    r = client.patch(f"/api/sources/{sid}", json={"name": "Renamed"})

    assert r.status_code == 200
    assert r.json()["name"] == "Renamed"


def test_patch_unknown_source_returns_404(tmp_path):
    client = TestClient(create_app())
    r = client.patch("/api/sources/99999", json={"name": "x"})
    assert r.status_code == 404


def test_delete_source_returns_204(tmp_path):
    client = TestClient(create_app())
    folder = tmp_path / "beats"
    folder.mkdir()
    sid = client.post("/api/sources", json={"root_path": str(folder)}).json()["id"]

    r = client.delete(f"/api/sources/{sid}")
    assert r.status_code == 204

    r = client.get("/api/sources")
    assert r.json() == []


def test_delete_unknown_source_returns_404(tmp_path):
    client = TestClient(create_app())
    r = client.delete("/api/sources/99999")
    assert r.status_code == 404


def test_source_status_endpoint(tmp_path):
    client = TestClient(create_app())
    folder = tmp_path / "beats"
    folder.mkdir()
    sid = client.post("/api/sources", json={"root_path": str(folder)}).json()["id"]

    r = client.get(f"/api/sources/{sid}/status")

    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "online"
    assert body["source_id"] == sid


def test_source_status_unknown_returns_404(tmp_path):
    client = TestClient(create_app())
    r = client.get("/api/sources/99999/status")
    assert r.status_code == 404
