"""Durable publish history (migration 024) — core service round trips."""
from __future__ import annotations

import datetime as _dt

import aiosqlite
import pytest

from beatos_core.publish_history.service import (
    get_attempt,
    list_attempts,
    set_hidden,
    upsert_attempt,
    upsert_attempt_sync,
    upsert_field_reports,
    upsert_field_reports_sync,
)


async def _make_track(db, title: str = "My Beat") -> int:
    now = _dt.datetime.now(_dt.timezone.utc).isoformat()
    async with aiosqlite.connect(db) as conn:
        cur = await conn.execute(
            "INSERT INTO track (title, created_at, updated_at) VALUES (?, ?, ?)",
            (title, now, now),
        )
        await conn.commit()
        return cur.lastrowid


def _reports() -> list[dict]:
    return [
        {"page": "upload", "field_id": "title", "label": "Title",
         "outcome": "filled", "source": "ticket", "value": "My Beat",
         "duration_ms": 42},
        {"page": "upload", "field_id": "bpm", "outcome": "filled",
         "source": "ticket", "value": "140"},
        {"page": "upload", "field_id": "genre", "outcome": "needs-user",
         "reason": "vocab miss"},
        {"page": "pricing", "field_id": "price", "outcome": "skipped"},
        {"page": "pricing", "field_id": "stems", "outcome": "failed",
         "reason": "selector gone"},
        {"page": "upload", "outcome": "filled"},  # no field key → skipped
    ]


@pytest.mark.asyncio
async def test_round_trip_attempt_reports_list_get_hide(fresh_db):
    track_id = await _make_track(fresh_db)

    attempt_id = await upsert_attempt(
        job_id="job-1", track_id=track_id, platform="beatstars",
        account="default", mode="extension", dry_run=False,
        stage="staged", message="waiting for extension",
    )
    assert attempt_id > 0

    written = await upsert_field_reports("job-1", _reports())
    assert written == 5  # the keyless entry is dropped

    attempts = await list_attempts()
    assert len(attempts) == 1
    row = attempts[0]
    assert row["id"] == attempt_id
    assert row["job_id"] == "job-1"
    assert row["track_id"] == track_id
    assert row["track_title"] == "My Beat"
    assert row["platform"] == "beatstars"
    assert row["account"] == "default"
    assert row["mode"] == "extension"
    assert row["dry_run"] is False
    assert row["hidden"] is False
    assert row["outcome"] == ""
    assert row["stage"] == "staged"
    assert row["listing_url"] is None
    assert row["finished_at"] is None
    assert row["created_at"]
    assert row["counts"] == {
        "filled": 2, "skipped": 1, "needs_user": 1, "failed": 1,
    }

    # Progress: same job_id upserts in place, keeping created_at.
    created_at = row["created_at"]
    same_id = await upsert_attempt(
        job_id="job-1", track_id=track_id, platform="beatstars",
        mode="extension", stage="done", message="published",
        outcome="success", listing_url="https://beatstars.test/x",
        finished_at="2026-08-02T10:00:00+00:00",
    )
    assert same_id == attempt_id
    assert len(await list_attempts()) == 1

    detail = await get_attempt(attempt_id)
    assert detail is not None
    assert detail["created_at"] == created_at          # preserved
    assert detail["stage"] == "done"
    assert detail["outcome"] == "success"
    assert detail["listing_url"] == "https://beatstars.test/x"
    assert detail["finished_at"] == "2026-08-02T10:00:00+00:00"
    assert detail["track_title"] == "My Beat"
    assert detail["counts"]["filled"] == 2
    # Ordered by (page, field_key).
    assert [(r["page"], r["field_key"]) for r in detail["field_reports"]] == [
        ("pricing", "price"), ("pricing", "stems"),
        ("upload", "bpm"), ("upload", "genre"), ("upload", "title"),
    ]
    title_row = next(r for r in detail["field_reports"] if r["field_key"] == "title")
    assert title_row["label"] == "Title"
    assert title_row["outcome"] == "filled"
    assert title_row["source"] == "ticket"
    assert title_row["value"] == "My Beat"
    assert title_row["duration_ms"] == 42
    assert title_row["updated_at"]
    genre_row = next(r for r in detail["field_reports"] if r["field_key"] == "genre")
    assert genre_row["reason"] == "vocab miss"
    assert genre_row["duration_ms"] is None

    # Hide is a soft flag — the row survives and comes back with include_hidden.
    assert await set_hidden(attempt_id, True) is True
    assert await list_attempts() == []
    hidden = await list_attempts(include_hidden=True)
    assert len(hidden) == 1 and hidden[0]["hidden"] is True
    assert (await get_attempt(attempt_id)) is not None   # never deleted
    assert await set_hidden(attempt_id, False) is True
    assert len(await list_attempts()) == 1

    assert await set_hidden(999_999, True) is False
    assert await get_attempt(999_999) is None


@pytest.mark.asyncio
async def test_sticky_outcome_and_listing_url_survive_later_progress(fresh_db):
    """A terminal verdict must not be blanked by a later re-persist (orphan
    reap / late progress emission re-upserting with empty fields)."""
    track_id = await _make_track(fresh_db)
    await upsert_attempt(
        job_id="job-1", track_id=track_id, platform="netease", stage="done",
        outcome="success", listing_url="https://netease.test/1",
        finished_at="2026-08-02T09:00:00+00:00",
    )
    await upsert_attempt(
        job_id="job-1", track_id=track_id, platform="netease",
        stage="filling_metadata", message="late emission",
    )
    row = (await list_attempts())[0]
    assert row["stage"] == "filling_metadata"       # stage always follows
    assert row["message"] == "late emission"
    assert row["outcome"] == "success"              # verdict is sticky
    assert row["listing_url"] == "https://netease.test/1"
    assert row["finished_at"] == "2026-08-02T09:00:00+00:00"


@pytest.mark.asyncio
async def test_re_report_same_field_updates_in_place(fresh_db):
    """Cumulative re-sends must UPDATE, not accumulate — that is what the
    (attempt_id, page, field_key) unique key is for."""
    track_id = await _make_track(fresh_db)
    attempt_id = await upsert_attempt(
        job_id="job-1", track_id=track_id, platform="beatstars",
        mode="extension", stage="claimed",
    )
    await upsert_field_reports("job-1", [
        {"page": "upload", "field_id": "title", "outcome": "needs-user"},
    ])
    await upsert_field_reports("job-1", [
        {"page": "upload", "field_id": "title", "outcome": "filled",
         "value": "My Beat"},
        {"page": "upload", "field_id": "bpm", "outcome": "filled"},
    ])
    detail = await get_attempt(attempt_id)
    assert len(detail["field_reports"]) == 2
    title = next(r for r in detail["field_reports"] if r["field_key"] == "title")
    assert title["outcome"] == "filled"
    assert title["value"] == "My Beat"
    assert detail["counts"] == {
        "filled": 2, "skipped": 0, "needs_user": 0, "failed": 0,
    }

    # A page-less field keys on page='' (NOT NULL default) and stays one row.
    await upsert_field_reports("job-1", [{"field_id": "solo", "outcome": "filled"}])
    await upsert_field_reports("job-1", [{"field_id": "solo", "outcome": "skipped"}])
    detail = await get_attempt(attempt_id)
    solo = [r for r in detail["field_reports"] if r["field_key"] == "solo"]
    assert len(solo) == 1 and solo[0]["page"] == "" and solo[0]["outcome"] == "skipped"


@pytest.mark.asyncio
async def test_reports_for_unknown_job_are_dropped_not_fatal(fresh_db):
    assert await upsert_field_reports("ghost", _reports()) == 0
    assert upsert_field_reports_sync("ghost", _reports()) == 0


@pytest.mark.asyncio
async def test_list_filters_by_track_and_orders_newest_first(fresh_db):
    a = await _make_track(fresh_db, "Track A")
    b = await _make_track(fresh_db, "Track B")
    await upsert_attempt(job_id="j1", track_id=a, platform="beatstars",
                         stage="done", created_at="2026-08-01T00:00:00+00:00")
    await upsert_attempt(job_id="j2", track_id=b, platform="netease",
                         stage="done", created_at="2026-08-02T00:00:00+00:00")
    await upsert_attempt(job_id="j3", track_id=a, platform="netease",
                         stage="done", created_at="2026-08-03T00:00:00+00:00")

    assert [r["job_id"] for r in await list_attempts()] == ["j3", "j2", "j1"]
    assert [r["job_id"] for r in await list_attempts(track_id=a)] == ["j3", "j1"]
    assert [r["track_title"] for r in await list_attempts(track_id=b)] == ["Track B"]
    assert [r["job_id"] for r in await list_attempts(limit=1)] == ["j3"]
    # Every attempt gets a counts block even with zero field reports.
    assert (await list_attempts(limit=1))[0]["counts"] == {
        "filled": 0, "skipped": 0, "needs_user": 0, "failed": 0,
    }


@pytest.mark.asyncio
async def test_track_delete_cascades_attempts_and_reports(fresh_db):
    """Rule 9 — with FK enforcement ON, purging a track takes its history."""
    track_id = await _make_track(fresh_db)
    attempt_id = await upsert_attempt(
        job_id="job-1", track_id=track_id, platform="beatstars", stage="done",
    )
    assert await upsert_field_reports("job-1", _reports()) == 5

    async with aiosqlite.connect(fresh_db) as conn:
        await conn.execute("PRAGMA foreign_keys=ON")
        await conn.execute("DELETE FROM track WHERE id = ?", (track_id,))
        await conn.commit()
        async with conn.execute("SELECT COUNT(*) FROM publish_attempt") as cur:
            assert (await cur.fetchone())[0] == 0
        async with conn.execute("SELECT COUNT(*) FROM publish_field_report") as cur:
            assert (await cur.fetchone())[0] == 0
    assert await get_attempt(attempt_id) is None


@pytest.mark.asyncio
async def test_connect_writable_enables_fk_enforcement(fresh_db):
    """The house helper the service uses is the one that turns FKs on (rule 9);
    a bare aiosqlite connection does NOT."""
    from beatos_core.db import connect_writable

    async with connect_writable() as conn:
        async with conn.execute("PRAGMA foreign_keys") as cur:
            assert (await cur.fetchone())[0] == 1
    async with aiosqlite.connect(fresh_db) as conn:
        async with conn.execute("PRAGMA foreign_keys") as cur:
            assert (await cur.fetchone())[0] == 0


@pytest.mark.asyncio
async def test_sync_twins_write_the_same_rows(fresh_db):
    """The Pro persistence thread uses the blocking twins — same SQL, same
    rows, and they also enforce FKs (an unknown track_id must not orphan)."""
    import sqlite3

    track_id = await _make_track(fresh_db)
    attempt_id = upsert_attempt_sync(
        job_id="job-sync", track_id=track_id, platform="beatstars",
        mode="extension", dry_run=True, stage="claimed", message="claimed",
    )
    assert attempt_id is not None
    assert upsert_field_reports_sync("job-sync", _reports()) == 5

    detail = await get_attempt(attempt_id)
    assert detail["job_id"] == "job-sync"
    assert detail["dry_run"] is True
    assert detail["counts"]["needs_user"] == 1
    assert len(detail["field_reports"]) == 5

    with pytest.raises(sqlite3.IntegrityError):
        upsert_attempt_sync(
            job_id="job-orphan", track_id=999_999, platform="beatstars",
            stage="queued",
        )
    assert not [a for a in await list_attempts() if a["job_id"] == "job-orphan"]
