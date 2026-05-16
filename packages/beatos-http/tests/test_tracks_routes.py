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


def test_source_filter_has_audio_reflects_audio_assets(tmp_path):
    """?source_id=<n> must return correct has_audio per track (Phase 1 follow-up)."""
    import asyncio
    from beatos_core.assets.service import attach_asset
    from beatos_core.sources.service import create_source
    from beatos_core.sources.models import SourceCreate

    client = TestClient(create_app())

    src_dir = tmp_path / "src"
    src_dir.mkdir()

    # Create source via service so root_path is registered.
    source = asyncio.get_event_loop().run_until_complete(
        create_source(SourceCreate(root_path=str(src_dir)))
    )

    # Create two tracks.
    t_with_audio = client.post("/api/tracks", json={"title": "HasAudio"}).json()
    t_no_audio = client.post("/api/tracks", json={"title": "NoAudio"}).json()

    # Attach a non-audio asset to both so they both appear under the source filter.
    cover1 = src_dir / "cover1.jpg"
    cover2 = src_dir / "cover2.jpg"
    cover1.write_bytes(b"\x00" * 64)
    cover2.write_bytes(b"\x00" * 64)
    asyncio.get_event_loop().run_until_complete(
        attach_asset(t_with_audio["id"], role="cover", path=cover1)
    )
    asyncio.get_event_loop().run_until_complete(
        attach_asset(t_no_audio["id"], role="cover", path=cover2)
    )

    # Attach an audio asset only to t_with_audio.
    audio_file = src_dir / "beat.wav"
    audio_file.write_bytes(b"\x00" * 64)
    asyncio.get_event_loop().run_until_complete(
        attach_asset(t_with_audio["id"], role="audio_tagged_wav", path=audio_file)
    )

    r = client.get(f"/api/tracks?source_id={source.id}")
    assert r.status_code == 200
    tracks = {t["title"]: t for t in r.json()}
    assert tracks["HasAudio"]["has_audio"] is True
    assert tracks["NoAudio"]["has_audio"] is False


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


def test_list_tracks_sort_by_title_asc(tmp_path):
    client = TestClient(create_app())
    client.post("/api/tracks", json={"title": "C"})
    client.post("/api/tracks", json={"title": "A"})
    client.post("/api/tracks", json={"title": "B"})

    res = client.get("/api/tracks?sort_by=title&sort_dir=asc")
    assert res.status_code == 200
    assert [t["title"] for t in res.json()] == ["A", "B", "C"]


def test_list_tracks_sort_by_title_desc(tmp_path):
    client = TestClient(create_app())
    client.post("/api/tracks", json={"title": "C"})
    client.post("/api/tracks", json={"title": "A"})
    client.post("/api/tracks", json={"title": "B"})

    res = client.get("/api/tracks?sort_by=title&sort_dir=desc")
    assert res.status_code == 200
    assert [t["title"] for t in res.json()] == ["C", "B", "A"]


def test_list_tracks_invalid_sort_by_returns_400(tmp_path):
    client = TestClient(create_app())
    res = client.get("/api/tracks?sort_by=description")
    assert res.status_code == 400


def test_list_tracks_invalid_sort_dir_returns_400(tmp_path):
    client = TestClient(create_app())
    res = client.get("/api/tracks?sort_dir=sideways")
    assert res.status_code == 400


def test_list_tracks_filter_by_producers(tmp_path):
    client = TestClient(create_app())
    t1 = client.post("/api/tracks", json={"title": "T1"}).json()
    t2 = client.post("/api/tracks", json={"title": "T2"}).json()
    t3 = client.post("/api/tracks", json={"title": "T3"}).json()
    client.put(f"/api/tracks/{t1['id']}", json={"producer": "Alice"})
    client.put(f"/api/tracks/{t2['id']}", json={"producer": "Bob"})
    client.put(f"/api/tracks/{t3['id']}", json={"producer": "Charlie"})

    res = client.get("/api/tracks?producers=Alice&producers=Bob")
    assert res.status_code == 200
    assert {t["title"] for t in res.json()} == {"T1", "T2"}


def test_list_tracks_filter_bpm_range(tmp_path):
    client = TestClient(create_app())
    t1 = client.post("/api/tracks", json={"title": "Slow"}).json()
    t2 = client.post("/api/tracks", json={"title": "Mid"}).json()
    t3 = client.post("/api/tracks", json={"title": "Fast"}).json()
    client.put(f"/api/tracks/{t1['id']}", json={"bpm": 80})
    client.put(f"/api/tracks/{t2['id']}", json={"bpm": 120})
    client.put(f"/api/tracks/{t3['id']}", json={"bpm": 160})

    res = client.get("/api/tracks?bpm_min=100&bpm_max=140")
    assert res.status_code == 200
    assert {t["title"] for t in res.json()} == {"Mid"}


def test_list_tracks_in_list_with_filter(tmp_path):
    client = TestClient(create_app())
    t1 = client.post("/api/tracks", json={"title": "T1"}).json()
    t2 = client.post("/api/tracks", json={"title": "T2"}).json()
    client.put(f"/api/tracks/{t1['id']}", json={"producer": "Alice"})
    client.put(f"/api/tracks/{t2['id']}", json={"producer": "Bob"})
    list_id = client.post("/api/lists", json={"name": "MyList"}).json()["id"]
    client.post(f"/api/lists/{list_id}/tracks", json={"track_id": t1["id"]})
    client.post(f"/api/lists/{list_id}/tracks", json={"track_id": t2["id"]})

    res = client.get(f"/api/tracks?list_id={list_id}&producers=Alice")
    assert res.status_code == 200
    assert len(res.json()) == 1
    assert res.json()[0]["title"] == "T1"


def test_distinct_endpoint_producer(tmp_path):
    client = TestClient(create_app())
    t1 = client.post("/api/tracks", json={"title": "T1"}).json()
    t2 = client.post("/api/tracks", json={"title": "T2"}).json()
    client.put(f"/api/tracks/{t1['id']}", json={"producer": "Alice"})
    client.put(f"/api/tracks/{t2['id']}", json={"producer": "Bob"})

    res = client.get("/api/tracks/distinct/producer")
    assert res.status_code == 200
    assert isinstance(res.json(), list)
    assert res.json() == ["Alice", "Bob"]


def test_distinct_endpoint_invalid_field_returns_400(tmp_path):
    client = TestClient(create_app())
    res = client.get("/api/tracks/distinct/description")
    assert res.status_code == 400


def test_distinct_endpoint_genre(tmp_path):
    client = TestClient(create_app())
    t1 = client.post("/api/tracks", json={"title": "T1"}).json()
    client.put(f"/api/tracks/{t1['id']}", json={"genre": "hip-hop"})

    res = client.get("/api/tracks/distinct/genre")
    assert res.status_code == 200
    assert res.json() == ["hip-hop"]
