"""Integration tests for /api/lists routes."""
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


def test_list_after_init_includes_system(tmp_path):
    client = TestClient(create_app())

    res = client.get("/api/lists")

    assert res.status_code == 200
    names = [(l["name"], l["kind"]) for l in res.json()]
    assert ("All Beats", "system") in names


def test_create_user_list(tmp_path):
    client = TestClient(create_app())

    res = client.post("/api/lists", json={"name": "Trap", "kind": "user"})

    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "Trap"
    assert body["kind"] == "user"


def test_delete_system_list_returns_400(tmp_path):
    client = TestClient(create_app())
    sys_id = next(l["id"] for l in client.get("/api/lists").json() if l["kind"] == "system")

    res = client.delete(f"/api/lists/{sys_id}")

    assert res.status_code == 400


def test_membership_add_and_remove(tmp_path):
    client = TestClient(create_app())
    track_id = client.post("/api/tracks", json={"title": "T"}).json()["id"]
    list_id = client.post("/api/lists", json={"name": "Trap"}).json()["id"]

    add = client.post(f"/api/lists/{list_id}/tracks", json={"track_id": track_id})
    assert add.status_code == 200

    rem = client.delete(f"/api/lists/{list_id}/tracks/{track_id}")
    assert rem.status_code == 204
