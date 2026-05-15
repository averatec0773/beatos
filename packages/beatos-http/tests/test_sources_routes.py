"""Integration tests for /api/sources routes + lifespan wiring."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from beatos_core.db import run_migrations
from beatos_http.app import create_app, get_watcher_registry


@pytest.fixture
def isolated_db(tmp_path, monkeypatch):
    """Each test gets its own isolated global DB."""
    db_path = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(db_path))
    return db_path


@pytest.fixture
def client(isolated_db):
    """TestClient as a context manager triggers FastAPI lifespan."""
    with TestClient(create_app()) as c:
        yield c


def test_create_and_list_source(client, tmp_path):
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


def test_create_source_conflict(client, tmp_path):
    folder = tmp_path / "beats"
    folder.mkdir()
    r1 = client.post("/api/sources", json={"root_path": str(folder)})
    assert r1.status_code == 201

    r2 = client.post("/api/sources", json={"root_path": str(folder)})
    assert r2.status_code == 409


def test_create_source_400_on_invalid_path(client, tmp_path):
    missing = tmp_path / "does-not-exist"

    r = client.post("/api/sources", json={"root_path": str(missing)})

    assert r.status_code == 400


def test_patch_source_rename(client, tmp_path):
    folder = tmp_path / "beats"
    folder.mkdir()
    sid = client.post("/api/sources", json={"root_path": str(folder)}).json()["id"]

    r = client.patch(f"/api/sources/{sid}", json={"name": "Renamed"})

    assert r.status_code == 200
    assert r.json()["name"] == "Renamed"


def test_patch_unknown_source_returns_404(client):
    r = client.patch("/api/sources/99999", json={"name": "x"})
    assert r.status_code == 404


def test_delete_source_returns_204(client, tmp_path):
    folder = tmp_path / "beats"
    folder.mkdir()
    sid = client.post("/api/sources", json={"root_path": str(folder)}).json()["id"]

    r = client.delete(f"/api/sources/{sid}")
    assert r.status_code == 204

    r = client.get("/api/sources")
    assert r.json() == []


def test_delete_unknown_source_returns_404(client):
    r = client.delete("/api/sources/99999")
    assert r.status_code == 404


def test_source_status_endpoint(client, tmp_path):
    folder = tmp_path / "beats"
    folder.mkdir()
    sid = client.post("/api/sources", json={"root_path": str(folder)}).json()["id"]

    r = client.get(f"/api/sources/{sid}/status")

    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "online"
    assert body["source_id"] == sid


def test_source_status_unknown_returns_404(client):
    r = client.get("/api/sources/99999/status")
    assert r.status_code == 404


def test_watcher_starts_when_source_added(client, tmp_path):
    """Lifespan wiring: POST /api/sources starts a watcher for the new Source."""
    folder = tmp_path / "beats"
    folder.mkdir()

    r = client.post("/api/sources", json={"root_path": str(folder)})
    sid = r.json()["id"]

    registry = get_watcher_registry()
    assert sid in registry.active_source_ids()


def test_watcher_stops_when_source_deleted(client, tmp_path):
    folder = tmp_path / "beats"
    folder.mkdir()
    sid = client.post("/api/sources", json={"root_path": str(folder)}).json()["id"]
    assert sid in get_watcher_registry().active_source_ids()

    client.delete(f"/api/sources/{sid}")

    assert sid not in get_watcher_registry().active_source_ids()


def test_lifespan_seeds_watchers_for_existing_sources(isolated_db, tmp_path):
    """Sources created before app startup get watchers in the seed loop."""
    import asyncio

    folder = tmp_path / "preexisting"
    folder.mkdir()

    async def _seed() -> int:
        from beatos_core.sources.models import SourceCreate
        from beatos_core.sources.service import create_source

        await run_migrations(isolated_db)
        src = await create_source(SourceCreate(root_path=str(folder)))
        return src.id

    seeded_id = asyncio.run(_seed())

    with TestClient(create_app()) as _:
        assert seeded_id in get_watcher_registry().active_source_ids()
