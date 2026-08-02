"""Durable publish-history routes (P4).

The router is NOT pro-gated — history is catalog data and must stay readable in
a free build. The test app includes it defensively (it is a no-op once app.py
registers it) BEFORE nothing else matters, but note the shadowing hazard the
route module documents: publish.py's catch-all GET /api/publish/{job_id} must be
registered AFTER this router in app.py.
"""
from __future__ import annotations

import datetime as _dt

import aiosqlite
import pytest
from httpx import ASGITransport, AsyncClient

from beatos_core.db import run_migrations
from beatos_core.publish_history.service import upsert_attempt, upsert_field_reports
from beatos_http.app import create_app
from beatos_http.routes import publish_history as history_routes


@pytest.fixture
async def db(tmp_path, monkeypatch):
    db_path = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(db_path))
    await run_migrations(db_path)
    yield db_path


def _app():
    app = create_app()
    # Idempotent: once app.py includes the router this becomes a no-op, and the
    # test keeps passing either way.
    if not any(
        getattr(r, "path", "") == "/api/publish/history" for r in app.routes
    ):
        # Prepend: publish.py's GET /api/publish/{job_id} catch-all would
        # otherwise shadow GET /api/publish/history.
        before = len(app.routes)
        app.include_router(history_routes.router)
        app.router.routes = app.routes[before:] + app.routes[:before]
    return app


def _client():
    return AsyncClient(transport=ASGITransport(app=_app()), base_url="http://t")


async def _track(db, title: str = "My Beat") -> int:
    now = _dt.datetime.now(_dt.timezone.utc).isoformat()
    async with aiosqlite.connect(db) as conn:
        cur = await conn.execute(
            "INSERT INTO track (title, created_at, updated_at) VALUES (?, ?, ?)",
            (title, now, now),
        )
        await conn.commit()
        return cur.lastrowid


async def _seed(db, job_id="job-1", title="My Beat", **kw) -> tuple[int, int]:
    track_id = await _track(db, title)
    attempt_id = await upsert_attempt(
        job_id=job_id, track_id=track_id, platform="beatstars",
        mode="extension", stage=kw.pop("stage", "done"), **kw,
    )
    return track_id, attempt_id


@pytest.mark.asyncio
async def test_list_detail_shapes(db):
    track_id, attempt_id = await _seed(
        db, outcome="success", listing_url="https://beatstars.test/x",
        message="published", finished_at="2026-08-02T10:00:00+00:00",
    )
    await upsert_field_reports("job-1", [
        {"page": "upload", "field_id": "title", "label": "Title",
         "outcome": "filled", "source": "ticket", "value": "My Beat",
         "duration_ms": 42},
        {"page": "upload", "field_id": "genre", "outcome": "needs-user",
         "reason": "vocab miss"},
    ])

    async with _client() as c:
        r = await c.get("/api/publish/history")
        assert r.status_code == 200
        body = r.json()
        assert list(body) == ["attempts"]
        assert len(body["attempts"]) == 1
        assert body["attempts"][0] == {
            "id": attempt_id, "job_id": "job-1", "track_id": track_id,
            "track_title": "My Beat", "platform": "beatstars",
            "account": "default", "mode": "extension", "dry_run": False,
            "outcome": "success", "stage": "done", "message": "published",
            "listing_url": "https://beatstars.test/x", "hidden": False,
            "created_at": body["attempts"][0]["created_at"],
            "finished_at": "2026-08-02T10:00:00+00:00",
            "counts": {"filled": 1, "skipped": 0, "needs_user": 1, "failed": 0},
        }

        r = await c.get(f"/api/publish/history/{attempt_id}")
        assert r.status_code == 200
        detail = r.json()
        assert set(detail) == {"attempt", "field_reports"}
        assert detail["attempt"]["id"] == attempt_id
        assert "field_reports" not in detail["attempt"]
        assert detail["field_reports"][0] == {
            "id": detail["field_reports"][0]["id"], "attempt_id": attempt_id,
            "page": "upload", "field_key": "genre", "label": "",
            "outcome": "needs-user", "source": "", "value": "",
            "reason": "vocab miss", "duration_ms": None,
            "updated_at": detail["field_reports"][0]["updated_at"],
        }
        assert [r_["field_key"] for r_ in detail["field_reports"]] == ["genre", "title"]


@pytest.mark.asyncio
async def test_list_query_params(db):
    track_a, _ = await _seed(db, job_id="j1", title="A",
                             created_at="2026-08-01T00:00:00+00:00")
    _track_b, hidden_id = await _seed(db, job_id="j2", title="B",
                                      created_at="2026-08-02T00:00:00+00:00")
    async with _client() as c:
        assert [a["job_id"] for a in (await c.get("/api/publish/history")).json()["attempts"]] == ["j2", "j1"]

        r = await c.get("/api/publish/history", params={"track_id": track_a})
        assert [a["job_id"] for a in r.json()["attempts"]] == ["j1"]

        r = await c.get("/api/publish/history", params={"limit": 1})
        assert [a["job_id"] for a in r.json()["attempts"]] == ["j2"]

        await c.post(f"/api/publish/history/{hidden_id}/hide", json={"hidden": True})
        r = await c.get("/api/publish/history")
        assert [a["job_id"] for a in r.json()["attempts"]] == ["j1"]
        r = await c.get("/api/publish/history", params={"include_hidden": True})
        assert [a["job_id"] for a in r.json()["attempts"]] == ["j2", "j1"]

        # Out-of-range limit is a 422, not a silent full-table scan.
        assert (await c.get("/api/publish/history", params={"limit": 0})).status_code == 422


@pytest.mark.asyncio
async def test_hide_toggles_and_never_deletes(db):
    _track_id, attempt_id = await _seed(db)
    async with _client() as c:
        r = await c.post(f"/api/publish/history/{attempt_id}/hide", json={"hidden": True})
        assert r.status_code == 200 and r.json() == {"ok": True}
        assert (await c.get(f"/api/publish/history/{attempt_id}")).json()["attempt"]["hidden"] is True
        r = await c.post(f"/api/publish/history/{attempt_id}/hide", json={"hidden": False})
        assert r.status_code == 200
        assert (await c.get(f"/api/publish/history/{attempt_id}")).json()["attempt"]["hidden"] is False


@pytest.mark.asyncio
async def test_404s(db):
    async with _client() as c:
        assert (await c.get("/api/publish/history/9999")).status_code == 404
        r = await c.post("/api/publish/history/9999/hide", json={"hidden": True})
        assert r.status_code == 404


@pytest.mark.asyncio
async def test_hide_is_token_gated_but_reads_are_open(db, monkeypatch):
    _track_id, attempt_id = await _seed(db)
    monkeypatch.setenv("BEATOS_API_TOKEN", "tkn")
    async with _client() as c:
        # Reads stay open (mirrors the other read routes).
        assert (await c.get("/api/publish/history")).status_code == 200
        assert (await c.get(f"/api/publish/history/{attempt_id}")).status_code == 200
        # Mutating: no token / wrong token → 401, and nothing changed.
        assert (await c.post(f"/api/publish/history/{attempt_id}/hide",
                             json={"hidden": True})).status_code == 401
        assert (await c.post(f"/api/publish/history/{attempt_id}/hide",
                             json={"hidden": True},
                             headers={"Authorization": "Bearer nope"})).status_code == 401
        assert (await c.get(f"/api/publish/history/{attempt_id}")).json()["attempt"]["hidden"] is False
        r = await c.post(f"/api/publish/history/{attempt_id}/hide",
                         json={"hidden": True},
                         headers={"Authorization": "Bearer tkn"})
        assert r.status_code == 200


@pytest.mark.asyncio
async def test_history_survives_publish_job_row_deletion(db):
    """The whole point: publish_job is a hard-deletable cache; the attempt row
    is the durable record and must outlive it."""
    _track_id, attempt_id = await _seed(db, outcome="success")
    now = _dt.datetime.now(_dt.timezone.utc).isoformat()
    async with aiosqlite.connect(db) as conn:
        await conn.execute(
            "INSERT INTO publish_job (job_id, track_id, platform, account, stage, "
            "message, result_json, request_json, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ("job-1", _track_id, "beatstars", "default", "done", "",
             None, "{}", now, now),
        )
        await conn.commit()
        # "Clear all" hard-deletes the cache…
        await conn.execute("PRAGMA foreign_keys=ON")
        await conn.execute("DELETE FROM publish_job")
        await conn.commit()
        async with conn.execute("SELECT COUNT(*) FROM publish_job") as cur:
            assert (await cur.fetchone())[0] == 0

    async with _client() as c:
        body = (await c.get("/api/publish/history")).json()
        assert [a["job_id"] for a in body["attempts"]] == ["job-1"]
        assert (await c.get(f"/api/publish/history/{attempt_id}")).status_code == 200


@pytest.mark.asyncio
async def test_history_reads_without_pro(db, monkeypatch):
    """History is not pro-gated — it must answer even when the engine is absent."""
    monkeypatch.setattr("beatos_http.pro.pro_available", lambda: False)
    await _seed(db)
    async with _client() as c:
        r = await c.get("/api/publish/history")
        assert r.status_code == 200
        assert len(r.json()["attempts"]) == 1
