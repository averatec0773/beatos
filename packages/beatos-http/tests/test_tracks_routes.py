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


def test_get_tracks_filtered_by_source(tmp_path):
    """?source_id filters tracks to those with assets under that Source's root."""
    import wave

    def _make_wav(path):
        with wave.open(str(path), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(44100)
            w.writeframes(b"\x00\x00" * 44100)

    client = TestClient(create_app())

    s1 = tmp_path / "s1"
    s2 = tmp_path / "s2"
    s1.mkdir()
    s2.mkdir()
    sid1 = client.post("/api/sources", json={"root_path": str(s1)}).json()["id"]
    sid2 = client.post("/api/sources", json={"root_path": str(s2)}).json()["id"]

    t1 = client.post("/api/tracks", json={"title": "T1"}).json()
    t2 = client.post("/api/tracks", json={"title": "T2"}).json()
    a1 = s1 / "a.wav"
    a2 = s2 / "b.wav"
    _make_wav(a1)
    _make_wav(a2)
    client.post(
        f"/api/tracks/{t1['id']}/assets",
        json={"role": "audio_tagged_mp3", "path": str(a1)},
    )
    client.post(
        f"/api/tracks/{t2['id']}/assets",
        json={"role": "audio_tagged_mp3", "path": str(a2)},
    )

    r1 = client.get(f"/api/tracks?source_id={sid1}")
    assert r1.status_code == 200
    assert {t["title"] for t in r1.json()} == {"T1"}

    r2 = client.get(f"/api/tracks?source_id={sid2}")
    assert {t["title"] for t in r2.json()} == {"T2"}

    # No filter returns both.
    r_all = client.get("/api/tracks")
    assert {t["title"] for t in r_all.json()} == {"T1", "T2"}


def test_get_tracks_unknown_source_returns_empty(tmp_path):
    client = TestClient(create_app())
    client.post("/api/tracks", json={"title": "T"})

    r = client.get("/api/tracks?source_id=99999")

    assert r.status_code == 200
    assert r.json() == []


def test_get_tracks_filtered_by_list(tmp_path):
    """?list_id returns only tracks in that list, spanning Sources."""
    client = TestClient(create_app())

    t1 = client.post("/api/tracks", json={"title": "T1"}).json()
    t2 = client.post("/api/tracks", json={"title": "T2"}).json()
    t3 = client.post("/api/tracks", json={"title": "T3"}).json()

    list_id = client.post("/api/lists", json={"name": "Trap"}).json()["id"]
    client.post(f"/api/lists/{list_id}/tracks", json={"track_id": t1["id"]})
    client.post(f"/api/lists/{list_id}/tracks", json={"track_id": t3["id"]})

    r = client.get(f"/api/tracks?list_id={list_id}")
    assert r.status_code == 200
    assert {t["title"] for t in r.json()} == {"T1", "T3"}

    # list_id beats source_id.
    r2 = client.get(f"/api/tracks?list_id={list_id}&source_id=99999")
    assert {t["title"] for t in r2.json()} == {"T1", "T3"}

    # Unknown list yields empty.
    r3 = client.get("/api/tracks?list_id=99999")
    assert r3.status_code == 200
    assert r3.json() == []
    _ = t2  # silence linter; t2 deliberately not in list
