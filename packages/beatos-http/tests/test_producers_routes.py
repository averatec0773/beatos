"""Integration tests for /api/producers — rewrite (rename/merge/delete) + preview."""
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


def _make_track(client, title, producer):
    res = client.post("/api/tracks", json={"title": title})
    track_id = res.json()["id"]
    client.put(f"/api/tracks/{track_id}", json={"producer": producer})
    return track_id


def test_rename_single_producer_across_tracks(tmp_path):
    client = TestClient(create_app())
    t1 = _make_track(client, "A", ["Drake"])
    t2 = _make_track(client, "B", ["Drake", "21"])

    res = client.post("/api/producers/rewrite", json={"from": ["Drake"], "to": "drake"})

    assert res.status_code == 200
    assert res.json()["affected"] == 2
    assert client.get(f"/api/tracks/{t1}").json()["producer"] == ["drake"]
    # rename preserves order of other producers
    assert client.get(f"/api/tracks/{t2}").json()["producer"] == ["21", "drake"]


def test_merge_target_already_canonical_still_counted(tmp_path):
    """Track holding only the merge target counts as affected, matches preview."""
    client = TestClient(create_app())
    t1 = _make_track(client, "A", ["Alice"])   # already canonical, no DB change needed
    t2 = _make_track(client, "B", ["alice"])

    pr = client.post("/api/producers/preview", json={"values": ["Alice", "alice"]})
    rw = client.post(
        "/api/producers/rewrite",
        json={"from": ["Alice", "alice"], "to": "Alice"},
    )

    assert pr.json()["affected"] == 2
    assert rw.json()["affected"] == 2  # preview and rewrite must agree
    assert client.get(f"/api/tracks/{t1}").json()["producer"] == ["Alice"]
    assert client.get(f"/api/tracks/{t2}").json()["producer"] == ["Alice"]


def test_merge_collapses_duplicates(tmp_path):
    client = TestClient(create_app())
    t1 = _make_track(client, "A", ["Drake", "drake"])
    t2 = _make_track(client, "B", ["drake"])
    t3 = _make_track(client, "C", ["Other"])

    res = client.post(
        "/api/producers/rewrite",
        json={"from": ["Drake", "drake"], "to": "Drake"},
    )

    assert res.json()["affected"] == 2  # t3 untouched
    assert client.get(f"/api/tracks/{t1}").json()["producer"] == ["Drake"]
    assert client.get(f"/api/tracks/{t2}").json()["producer"] == ["Drake"]
    assert client.get(f"/api/tracks/{t3}").json()["producer"] == ["Other"]


def test_delete_strips_from_array_keeping_empty_arrays(tmp_path):
    client = TestClient(create_app())
    t1 = _make_track(client, "A", ["Drake"])           # becomes []
    t2 = _make_track(client, "B", ["Drake", "21"])     # becomes ["21"]
    t3 = _make_track(client, "C", ["21"])              # untouched

    res = client.post("/api/producers/rewrite", json={"from": ["Drake"], "to": None})

    assert res.json()["affected"] == 2
    assert client.get(f"/api/tracks/{t1}").json()["producer"] == []
    assert client.get(f"/api/tracks/{t2}").json()["producer"] == ["21"]
    assert client.get(f"/api/tracks/{t3}").json()["producer"] == ["21"]


def test_delete_via_empty_string_treated_as_none(tmp_path):
    client = TestClient(create_app())
    t1 = _make_track(client, "A", ["Drake"])

    res = client.post("/api/producers/rewrite", json={"from": ["Drake"], "to": "   "})

    assert res.json()["affected"] == 1
    assert client.get(f"/api/tracks/{t1}").json()["producer"] == []


def test_rewrite_no_match_is_noop(tmp_path):
    client = TestClient(create_app())
    _make_track(client, "A", ["Drake"])

    res = client.post(
        "/api/producers/rewrite",
        json={"from": ["DoesNotExist"], "to": "Whatever"},
    )

    assert res.status_code == 200
    assert res.json()["affected"] == 0


def test_rewrite_skips_trashed_tracks(tmp_path):
    client = TestClient(create_app())
    t1 = _make_track(client, "A", ["Drake"])
    t2 = _make_track(client, "B", ["Drake"])
    client.delete(f"/api/tracks/{t2}")  # soft delete

    res = client.post("/api/producers/rewrite", json={"from": ["Drake"], "to": "drake"})

    assert res.json()["affected"] == 1
    assert client.get(f"/api/tracks/{t1}").json()["producer"] == ["drake"]
    # trashed track keeps original
    assert client.get(f"/api/tracks/{t2}").json()["producer"] == ["Drake"]


def test_rewrite_rejects_empty_from(tmp_path):
    client = TestClient(create_app())
    res = client.post("/api/producers/rewrite", json={"from": [], "to": "X"})
    assert res.status_code == 400


def test_preview_counts_affected_tracks(tmp_path):
    client = TestClient(create_app())
    _make_track(client, "A", ["Drake"])
    _make_track(client, "B", ["Drake", "21"])
    _make_track(client, "C", ["21"])

    res = client.post("/api/producers/preview", json={"values": ["Drake"]})

    assert res.status_code == 200
    assert res.json()["affected"] == 2


def test_preview_rejects_empty_values(tmp_path):
    client = TestClient(create_app())
    res = client.post("/api/producers/preview", json={"values": []})
    assert res.status_code == 400


def test_preview_excludes_trashed(tmp_path):
    client = TestClient(create_app())
    _make_track(client, "A", ["Drake"])
    t2 = _make_track(client, "B", ["Drake"])
    client.delete(f"/api/tracks/{t2}")

    res = client.post("/api/producers/preview", json={"values": ["Drake"]})

    assert res.json()["affected"] == 1


def test_distinct_reflects_rewrite(tmp_path):
    client = TestClient(create_app())
    _make_track(client, "A", ["Drake"])
    _make_track(client, "B", ["drake"])

    client.post("/api/producers/rewrite", json={"from": ["drake"], "to": "Drake"})

    distinct = client.get("/api/tracks/distinct/producer").json()
    assert distinct == ["Drake"]
