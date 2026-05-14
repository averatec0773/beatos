"""Integration tests for /api/libraries routes."""
import pathlib

import pytest
from fastapi.testclient import TestClient

from beatos_core import state
from beatos_http.app import create_app


@pytest.fixture(autouse=True)
async def _isolate(tmp_path, monkeypatch):
    """Isolate registry per test + reset active state."""
    monkeypatch.setenv("BEATOS_REGISTRY_PATH", str(tmp_path / "known_libraries.json"))
    await state.set_active(None)
    yield
    await state.set_active(None)


def test_init_creates_library_and_returns_it(tmp_path):
    client = TestClient(create_app())
    root = tmp_path / "Lib"
    root.mkdir()

    res = client.post("/api/libraries/init", json={"path": str(root)})

    assert res.status_code == 200
    body = res.json()
    assert body["root_path"] == str(root.resolve())
    assert body["is_active"] is True


def test_active_returns_404_when_no_library(tmp_path):
    client = TestClient(create_app())

    res = client.get("/api/libraries/active")

    assert res.status_code == 404


def test_active_returns_library_after_init(tmp_path):
    client = TestClient(create_app())
    root = tmp_path / "Lib"
    root.mkdir()
    client.post("/api/libraries/init", json={"path": str(root)})

    res = client.get("/api/libraries/active")

    assert res.status_code == 200
    assert res.json()["root_path"] == str(root.resolve())


def test_list_returns_registered_libraries(tmp_path):
    client = TestClient(create_app())
    root_a = tmp_path / "A"
    root_b = tmp_path / "B"
    root_a.mkdir()
    root_b.mkdir()
    client.post("/api/libraries/init", json={"path": str(root_a)})
    client.post("/api/libraries/init", json={"path": str(root_b)})

    res = client.get("/api/libraries")

    assert res.status_code == 200
    bodies = res.json()
    paths = sorted(b["root_path"] for b in bodies)
    assert paths == sorted([str(root_a.resolve()), str(root_b.resolve())])
    actives = [b for b in bodies if b["is_active"]]
    assert len(actives) == 1
    assert actives[0]["root_path"] == str(root_b.resolve())
