"""Integration tests for /api/tracks/{id}/license_tiers + /api/license_tiers."""
import pytest
from fastapi.testclient import TestClient

from beatos_core.db import run_migrations
from beatos_http.app import create_app


@pytest.fixture(autouse=True)
async def _fresh_db(tmp_path, monkeypatch):
    db_path = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(db_path))
    await run_migrations(db_path)
    yield


def _new_track(client: TestClient) -> int:
    return client.post("/api/tracks", json={"title": "T"}).json()["id"]


def test_list_empty_for_new_track():
    client = TestClient(create_app())
    tid = _new_track(client)
    res = client.get(f"/api/tracks/{tid}/license_tiers")
    assert res.status_code == 200
    assert res.json() == []


def test_create_returns_tier():
    client = TestClient(create_app())
    tid = _new_track(client)
    res = client.post(
        f"/api/tracks/{tid}/license_tiers",
        json={
            "name": "MP3",
            "deliverables": ["mp3"],
            "prices": {"CNY": 50.0, "USD": 8.0},
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["track_id"] == tid
    assert body["name"] == "MP3"
    assert body["deliverables"] == ["mp3"]
    assert body["prices"] == {"CNY": 50.0, "USD": 8.0}


def test_create_unknown_track_400():
    client = TestClient(create_app())
    res = client.post(
        "/api/tracks/9999/license_tiers",
        json={"name": "X"},
    )
    assert res.status_code == 400


def test_update_partial():
    client = TestClient(create_app())
    tid = _new_track(client)
    tier = client.post(
        f"/api/tracks/{tid}/license_tiers",
        json={"name": "MP3", "prices": {"CNY": 50.0}},
    ).json()
    res = client.put(
        f"/api/license_tiers/{tier['id']}", json={"prices": {"CNY": 75.0}}
    )
    assert res.status_code == 200
    assert res.json()["prices"] == {"CNY": 75.0}
    # name preserved
    assert res.json()["name"] == "MP3"


def test_delete_then_list_excludes():
    client = TestClient(create_app())
    tid = _new_track(client)
    tier = client.post(
        f"/api/tracks/{tid}/license_tiers", json={"name": "MP3"}
    ).json()
    del_res = client.delete(f"/api/license_tiers/{tier['id']}")
    assert del_res.status_code == 204
    assert client.get(f"/api/tracks/{tid}/license_tiers").json() == []


def test_reorder_assigns_positions():
    client = TestClient(create_app())
    tid = _new_track(client)
    ids = [
        client.post(f"/api/tracks/{tid}/license_tiers", json={"name": n}).json()["id"]
        for n in ("A", "B", "C")
    ]
    res = client.post(
        f"/api/tracks/{tid}/license_tiers/reorder",
        json={"ids": [ids[2], ids[0], ids[1]]},
    )
    assert res.status_code == 204
    order = [t["id"] for t in client.get(f"/api/tracks/{tid}/license_tiers").json()]
    assert order == [ids[2], ids[0], ids[1]]


def test_reorder_set_mismatch_400():
    client = TestClient(create_app())
    tid = _new_track(client)
    a = client.post(f"/api/tracks/{tid}/license_tiers", json={"name": "A"}).json()["id"]
    client.post(f"/api/tracks/{tid}/license_tiers", json={"name": "B"})
    res = client.post(
        f"/api/tracks/{tid}/license_tiers/reorder",
        json={"ids": [a]},  # missing B
    )
    assert res.status_code == 400


# --- Gap 3 test: share must round-trip through POST /api/tracks/{id}/license_tiers ---

def test_create_with_share_round_trips():
    """POST a tier with share=30.0; GET must return share=30.0."""
    client = TestClient(create_app())
    tid = _new_track(client)
    res = client.post(
        f"/api/tracks/{tid}/license_tiers",
        json={"name": "MP3", "deliverables": ["mp3"], "prices": {"CNY": 50.0}, "share": 30.0},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["share"] == 30.0

    tiers = client.get(f"/api/tracks/{tid}/license_tiers").json()
    assert len(tiers) == 1
    assert tiers[0]["share"] == 30.0


def test_create_with_share_null_round_trips():
    """POST a tier with share=null; GET must return share=null."""
    client = TestClient(create_app())
    tid = _new_track(client)
    res = client.post(
        f"/api/tracks/{tid}/license_tiers",
        json={"name": "WAV", "share": None},
    )
    assert res.status_code == 200
    assert res.json()["share"] is None
