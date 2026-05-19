"""HTTP routes for the 2PC token surface."""
import json
import time

import aiosqlite
import pytest
from httpx import ASGITransport, AsyncClient

from beatos_core.db import run_migrations
from beatos_core.two_phase import create_token
from beatos_http.app import create_app


@pytest.fixture
async def db_path(tmp_path, monkeypatch):
    path = tmp_path / "test.db"
    await run_migrations(path)
    monkeypatch.setenv("BEATOS_DB_PATH", str(path))
    return path


@pytest.fixture
async def client(db_path):
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        async with app.router.lifespan_context(app):
            yield c


@pytest.mark.asyncio
async def test_list_pending_tokens_empty(client):
    res = await client.get("/api/tokens?status=pending")
    assert res.status_code == 200
    assert res.json() == []


@pytest.mark.asyncio
async def test_list_pending_tokens_returns_open_rows(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        await create_token(conn, "create_list", {"name": "Trap 2026"})
    res = await client.get("/api/tokens?status=pending")
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 1
    row = body[0]
    assert row["tool_name"] == "create_list"
    assert row["payload"] == {"name": "Trap 2026"}
    assert "token" in row
    assert "expires_at" in row
    assert "created_at" in row


@pytest.mark.asyncio
async def test_approve_create_list_happy_path(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        token = await create_token(conn, "create_list", {"name": "Trap 2026"})

    res = await client.post(f"/api/tokens/{token}/approve")
    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "Trap 2026"
    assert isinstance(body["list_id"], int)

    # The list table now has a row
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT name, kind FROM list WHERE id=?", (body["list_id"],)
        ) as cur:
            row = await cur.fetchone()
    assert row == ("Trap 2026", "user")

    # The token is consumed with result populated
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT status, result FROM tokens WHERE token=?", (token,)
        ) as cur:
            row = await cur.fetchone()
    status, result_json = row
    assert status == "consumed"
    assert json.loads(result_json) == {"list_id": body["list_id"]}


@pytest.mark.asyncio
async def test_approve_token_not_found_returns_404(client):
    res = await client.post("/api/tokens/bogus/approve")
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_approve_already_consumed_returns_409(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        token = await create_token(conn, "create_list", {"name": "Trap"})
    await client.post(f"/api/tokens/{token}/approve")
    # Second approve must 409
    res = await client.post(f"/api/tokens/{token}/approve")
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_approve_unknown_tool_returns_400(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        token = await create_token(conn, "nonexistent_tool", {})
    res = await client.post(f"/api/tokens/{token}/approve")
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_reject_pending_marks_rejected(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        token = await create_token(conn, "create_list", {"name": "X"})
    res = await client.post(f"/api/tokens/{token}/reject")
    assert res.status_code == 200
    assert res.json() == {"ok": True}
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT status FROM tokens WHERE token=?", (token,)
        ) as cur:
            row = await cur.fetchone()
    assert row[0] == "rejected"


@pytest.mark.asyncio
async def test_reject_already_consumed_is_no_op_200(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        token = await create_token(conn, "create_list", {"name": "X"})
    await client.post(f"/api/tokens/{token}/approve")
    # Reject must NOT fail — Approve/Reject race tolerance
    res = await client.post(f"/api/tokens/{token}/reject")
    assert res.status_code == 200
    # Status stays consumed
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT status FROM tokens WHERE token=?", (token,)
        ) as cur:
            row = await cur.fetchone()
    assert row[0] == "consumed"


@pytest.mark.asyncio
async def test_reject_token_not_found_returns_404(client):
    res = await client.post("/api/tokens/bogus/reject")
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_cleanup_task_runs_on_startup(tmp_path, monkeypatch):
    """Lifespan startup runs cleanup once synchronously — old terminal rows
    must vanish before the app is ready to serve."""
    import time
    path = tmp_path / "test.db"
    await run_migrations(path)
    monkeypatch.setenv("BEATOS_DB_PATH", str(path))

    # Insert an old expired token directly before lifespan starts
    async with aiosqlite.connect(path) as conn:
        await conn.execute(
            "INSERT INTO tokens (token, tool_name, payload, created_at, expires_at, status, consumed_at) "
            "VALUES ('old', 'create_list', '{}', 0, 0, 'expired', ?)",
            (time.time() - 10 * 86400,),
        )
        await conn.commit()

    # Verify it's there before lifespan
    async with aiosqlite.connect(path) as conn:
        async with conn.execute("SELECT 1 FROM tokens WHERE token='old'") as cur:
            row = await cur.fetchone()
        assert row is not None, "precondition: row exists before lifespan"

    # Activate lifespan
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        async with app.router.lifespan_context(app):
            # Lifespan startup ran; old row should be gone
            async with aiosqlite.connect(path) as conn:
                async with conn.execute("SELECT 1 FROM tokens WHERE token='old'") as cur:
                    row = await cur.fetchone()
            assert row is None, "lifespan startup must have cleaned old terminal tokens"


@pytest.mark.asyncio
async def test_history_empty_returns_empty_array(client, db_path):
    res = await client.get("/api/tokens?status=history")
    assert res.status_code == 200
    assert res.json() == []


@pytest.mark.asyncio
async def test_history_includes_consumed_rejected_expired_within_24h(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        from beatos_core.two_phase import consume_token_with_result, reject_token
        t_ok = await create_token(conn, "create_list", {"name": "Done"})
        await consume_token_with_result(conn, t_ok, {"list_id": 1})
        t_rj = await create_token(conn, "create_list", {"name": "Nope"})
        await reject_token(conn, t_rj)
        now = time.time()
        await conn.execute(
            "INSERT INTO tokens (token, tool_name, payload, created_at, expires_at, status) "
            "VALUES ('exp1', 'create_list', '{\"name\": \"Stale\"}', ?, ?, 'expired')",
            (now - 600, now - 300),
        )
        await conn.commit()

    res = await client.get("/api/tokens?status=history")
    assert res.status_code == 200
    body = res.json()
    tokens = {row["token"]: row for row in body}
    assert set(tokens.keys()) == {t_ok, t_rj, "exp1"}
    assert tokens[t_ok]["status"] == "consumed"
    assert tokens[t_ok]["result"] == {"list_id": 1}
    assert tokens[t_rj]["status"] == "rejected"
    assert tokens["exp1"]["status"] == "expired"


@pytest.mark.asyncio
async def test_history_excludes_rows_older_than_24h(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        now = time.time()
        await conn.execute(
            "INSERT INTO tokens (token, tool_name, payload, created_at, expires_at, status, consumed_at) "
            "VALUES ('old', 'create_list', '{}', ?, ?, 'consumed', ?)",
            (now - 26 * 3600, now - 25 * 3600 + 300, now - 25 * 3600),
        )
        await conn.commit()
    res = await client.get("/api/tokens?status=history")
    assert res.status_code == 200
    assert res.json() == []


@pytest.mark.asyncio
async def test_history_excludes_pending_rows(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        await create_token(conn, "create_list", {"name": "Live"})
    res = await client.get("/api/tokens?status=history")
    assert res.status_code == 200
    assert res.json() == []


@pytest.mark.asyncio
async def test_history_sorted_most_recent_first(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        from beatos_core.two_phase import consume_token_with_result
        t1 = await create_token(conn, "create_list", {"name": "Earlier"})
        await consume_token_with_result(conn, t1, {"list_id": 1})
        await conn.execute(
            "UPDATE tokens SET consumed_at=? WHERE token=?",
            (time.time() - 600, t1),
        )
        await conn.commit()
        t2 = await create_token(conn, "create_list", {"name": "Later"})
        await consume_token_with_result(conn, t2, {"list_id": 2})
        await conn.commit()

    res = await client.get("/api/tokens?status=history")
    body = res.json()
    assert [r["token"] for r in body] == [t2, t1]


@pytest.mark.asyncio
async def test_row_vanished_in_handler_yields_409_and_rollback(client, db_path):
    """Stub a handler that raises RowVanishedError; verify dispatcher emits 409,
    rolls back, and leaves the token pending. Safety net for batch handlers
    introduced in v0.0.24 Tasks 3+."""
    from beatos_core.two_phase import RowVanishedError
    from beatos_http.routes.tokens import _APPROVE_HANDLERS, register_approve_handler

    @register_approve_handler("__test_row_vanished__")
    async def _stub(conn, token):
        # Simulate a write that "succeeded" then a row-vanished discovery.
        await conn.execute(
            "INSERT INTO list (name, kind, position, created_at) "
            "VALUES ('SHOULD_ROLLBACK', 'user', 0, '2026-01-01')"
        )
        raise RowVanishedError("simulated mid-batch vanish")

    try:
        async with aiosqlite.connect(db_path) as conn:
            tok = await create_token(conn, "__test_row_vanished__", {"x": 1})

        res = await client.post(f"/api/tokens/{tok}/approve")
        assert res.status_code == 409
        assert "simulated" in res.json()["detail"].lower()

        # The INSERT inside the handler must have been rolled back.
        async with aiosqlite.connect(db_path) as conn:
            async with conn.execute(
                "SELECT COUNT(*) FROM list WHERE name='SHOULD_ROLLBACK'"
            ) as cur:
                count = (await cur.fetchone())[0]
        assert count == 0, "RowVanishedError should roll back the handler's writes"

        # Token must still be pending (not consumed, not rejected).
        async with aiosqlite.connect(db_path) as conn:
            async with conn.execute(
                "SELECT status FROM tokens WHERE token=?", (tok,)
            ) as cur:
                assert (await cur.fetchone())[0] == "pending"
    finally:
        _APPROVE_HANDLERS.pop("__test_row_vanished__", None)
