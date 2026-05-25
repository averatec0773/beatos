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

    # soft-delete: track is hidden from list but still retrievable
    final_list = client.get("/api/tracks")
    assert final_list.json() == []

    # row still exists; get returns it with deleted_at set
    get_after = client.get(f"/api/tracks/{track_id}")
    assert get_after.status_code == 200
    assert get_after.json()["deleted_at"] is not None


def test_update_rejects_unknown_field(tmp_path):
    client = TestClient(create_app())
    track_id = client.post("/api/tracks", json={"title": "T"}).json()["id"]

    res = client.put(f"/api/tracks/{track_id}", json={"nonexistent_field": "x"})

    assert res.status_code == 422  # TrackUpdate has extra='forbid'


def test_get_missing_track_returns_404(tmp_path):
    client = TestClient(create_app())

    res = client.get("/api/tracks/99999")

    assert res.status_code == 404


def test_get_tracks_filtered_by_list(tmp_path):
    """?list_id returns only tracks in that list."""
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
    client.put(f"/api/tracks/{t1['id']}", json={"producer": ["Alice"]})
    client.put(f"/api/tracks/{t2['id']}", json={"producer": ["Bob"]})
    client.put(f"/api/tracks/{t3['id']}", json={"producer": ["Charlie"]})

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
    client.put(f"/api/tracks/{t1['id']}", json={"producer": ["Alice"]})
    client.put(f"/api/tracks/{t2['id']}", json={"producer": ["Bob"]})
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
    client.put(f"/api/tracks/{t1['id']}", json={"producer": ["Alice"]})
    client.put(f"/api/tracks/{t2['id']}", json={"producer": ["Bob"]})

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
    client.put(f"/api/tracks/{t1['id']}", json={"genre": ["hip-hop"]})

    res = client.get("/api/tracks/distinct/genre")
    assert res.status_code == 200
    assert res.json() == ["hip-hop"]


def test_list_id_default_position_order(tmp_path):
    """GET /api/tracks?list_id=N without sort_by returns tracks in position ASC order."""
    import asyncio
    import aiosqlite
    from beatos_core.db import resolve_db_path

    client = TestClient(create_app())

    t1 = client.post("/api/tracks", json={"title": "Alpha"}).json()
    t2 = client.post("/api/tracks", json={"title": "Beta"}).json()
    t3 = client.post("/api/tracks", json={"title": "Gamma"}).json()

    list_id = client.post("/api/lists", json={"name": "Ordered"}).json()["id"]
    client.post(f"/api/lists/{list_id}/tracks", json={"track_id": t1["id"]})
    client.post(f"/api/lists/{list_id}/tracks", json={"track_id": t2["id"]})
    client.post(f"/api/lists/{list_id}/tracks", json={"track_id": t3["id"]})

    db_path = resolve_db_path()

    async def _set_positions():
        async with aiosqlite.connect(db_path) as conn:
            await conn.execute(
                "UPDATE track_list SET position = ? WHERE track_id = ? AND list_id = ?",
                (30, t1["id"], list_id),
            )
            await conn.execute(
                "UPDATE track_list SET position = ? WHERE track_id = ? AND list_id = ?",
                (10, t2["id"], list_id),
            )
            await conn.execute(
                "UPDATE track_list SET position = ? WHERE track_id = ? AND list_id = ?",
                (20, t3["id"], list_id),
            )
            await conn.commit()

    asyncio.get_event_loop().run_until_complete(_set_positions())

    res = client.get(f"/api/tracks?list_id={list_id}")
    assert res.status_code == 200
    assert [t["title"] for t in res.json()] == ["Beta", "Gamma", "Alpha"]


def test_list_id_explicit_sort_by_title(tmp_path):
    """GET /api/tracks?list_id=N&sort_by=title&sort_dir=asc returns tracks by title."""
    client = TestClient(create_app())

    t1 = client.post("/api/tracks", json={"title": "Zebra"}).json()
    t2 = client.post("/api/tracks", json={"title": "Mango"}).json()
    t3 = client.post("/api/tracks", json={"title": "Apple"}).json()

    list_id = client.post("/api/lists", json={"name": "TitleSorted"}).json()["id"]
    client.post(f"/api/lists/{list_id}/tracks", json={"track_id": t1["id"]})
    client.post(f"/api/lists/{list_id}/tracks", json={"track_id": t2["id"]})
    client.post(f"/api/lists/{list_id}/tracks", json={"track_id": t3["id"]})

    res = client.get(f"/api/tracks?list_id={list_id}&sort_by=title&sort_dir=asc")
    assert res.status_code == 200
    assert [t["title"] for t in res.json()] == ["Apple", "Mango", "Zebra"]


def test_put_producer_list_round_trips(tmp_path):
    """PUT /api/tracks/{id} with producer as list persists and returns correctly."""
    client = TestClient(create_app())
    track_id = client.post("/api/tracks", json={"title": "Multi"}).json()["id"]

    res = client.put(f"/api/tracks/{track_id}", json={"producer": ["a", "b"]})
    assert res.status_code == 200
    assert res.json()["producer"] == ["a", "b"]

    get_res = client.get(f"/api/tracks/{track_id}")
    assert get_res.status_code == 200
    assert get_res.json()["producer"] == ["a", "b"]


# ---------------------------------------------------------------------------
# Trash / restore / purge route tests
# ---------------------------------------------------------------------------


def test_delete_soft_deletes_track(tmp_path):
    """DELETE /api/tracks/{id} soft-deletes: deleted_at set, row still exists."""
    client = TestClient(create_app())
    track_id = client.post("/api/tracks", json={"title": "SoftDel"}).json()["id"]

    del_res = client.delete(f"/api/tracks/{track_id}")
    assert del_res.status_code == 204

    # track hidden from list
    list_res = client.get("/api/tracks")
    assert not any(t["id"] == track_id for t in list_res.json())

    # row still accessible via get
    get_res = client.get(f"/api/tracks/{track_id}")
    assert get_res.status_code == 200
    assert get_res.json()["deleted_at"] is not None


def test_restore_clears_deleted_at(tmp_path):
    """POST /api/tracks/{id}/restore clears deleted_at and returns 200 Track."""
    client = TestClient(create_app())
    track_id = client.post("/api/tracks", json={"title": "Restorer"}).json()["id"]

    client.delete(f"/api/tracks/{track_id}")

    restore_res = client.post(f"/api/tracks/{track_id}/restore")
    assert restore_res.status_code == 200
    assert restore_res.json()["deleted_at"] is None
    assert restore_res.json()["id"] == track_id

    # track visible in list again
    list_res = client.get("/api/tracks")
    assert any(t["id"] == track_id for t in list_res.json())


def test_delete_purge_removes_row(tmp_path):
    """DELETE /api/tracks/{id}?purge=true hard-deletes: row gone, 404 on get."""
    client = TestClient(create_app())
    track_id = client.post("/api/tracks", json={"title": "Purger"}).json()["id"]

    del_res = client.delete(f"/api/tracks/{track_id}?purge=true")
    assert del_res.status_code == 204

    get_res = client.get(f"/api/tracks/{track_id}")
    assert get_res.status_code == 404


def test_get_track_count_excludes_trashed(tmp_path):
    """GET /api/tracks/count returns total count of non-trashed tracks."""
    client = TestClient(create_app())

    # Empty start
    res = client.get("/api/tracks/count")
    assert res.status_code == 200
    assert res.json() == {"total": 0}

    a_id = client.post("/api/tracks", json={"title": "a"}).json()["id"]
    client.post("/api/tracks", json={"title": "b"})
    client.post("/api/tracks", json={"title": "c"})

    res = client.get("/api/tracks/count")
    assert res.status_code == 200
    assert res.json() == {"total": 3}

    # Trash one
    del_res = client.delete(f"/api/tracks/{a_id}")
    assert del_res.status_code == 204

    res = client.get("/api/tracks/count")
    assert res.status_code == 200
    assert res.json() == {"total": 2}


def test_get_trash_returns_only_trashed(tmp_path):
    """GET /api/tracks/trash returns only trashed tracks."""
    client = TestClient(create_app())
    t1 = client.post("/api/tracks", json={"title": "Active"}).json()
    t2 = client.post("/api/tracks", json={"title": "Trashed"}).json()

    client.delete(f"/api/tracks/{t2['id']}")

    trash_res = client.get("/api/tracks/trash")
    assert trash_res.status_code == 200
    ids = [t["id"] for t in trash_res.json()]
    assert t2["id"] in ids
    assert t1["id"] not in ids


# ---------------------------------------------------------------------------
# query= parameter tests
# ---------------------------------------------------------------------------


def test_query_param_parity_with_discrete():
    client = TestClient(create_app())
    a = client.post("/api/tracks", json={"title": "Midnight Drive"}).json()["id"]
    client.put(f"/api/tracks/{a}", json={"genre": ["trap"], "bpm": 140})
    b = client.post("/api/tracks", json={"title": "Sunrise"}).json()["id"]
    client.put(f"/api/tracks/{b}", json={"genre": ["drill"], "bpm": 150})
    via_query = client.get("/api/tracks", params={"query": "genre:trap bpm:>=140"}).json()
    via_params = client.get("/api/tracks", params=[("genres", "trap"), ("bpm_min", 140)]).json()
    assert [t["id"] for t in via_query] == [t["id"] for t in via_params]
    assert [t["title"] for t in via_query] == ["Midnight Drive"]


def test_query_free_text_matches_producer():
    client = TestClient(create_app())
    a = client.post("/api/tracks", json={"title": "Midnight Drive"}).json()["id"]
    client.put(f"/api/tracks/{a}", json={"producer": ["AVERATEC"]})
    client.post("/api/tracks", json={"title": "Sunrise"})
    rows = client.get("/api/tracks", params={"query": "averatec"}).json()
    assert [t["title"] for t in rows] == ["Midnight Drive"]
