"""Durable publish history — `publish_attempt` + `publish_field_report` (024).

`publish_job` (020) is a WRITE-THROUGH CACHE of live jobs and is hard-deleted by
"Clear all" / DELETE /api/publish/{job_id}. This module owns the record that
outlives it: one upserted `publish_attempt` row per job, plus one
`publish_field_report` row per (page, field) the extension reported.

Two shapes of the same writes:

* ``upsert_attempt`` / ``upsert_field_reports`` — async (aiosqlite), used by the
  HTTP layer and anything already on the event loop.
* ``upsert_attempt_sync`` / ``upsert_field_reports_sync`` — sync (sqlite3), used
  by the Pro engine's single-thread persistence executor (`beatos_publish.jobs`)
  so history writes stay OFF the loop that drives the browser and stay ORDERED
  with the `publish_job` write-through they mirror. Same SQL, same parameter
  builders — the constants below are the single source of truth.

Rule 9: every connection opened here enables FK enforcement. The async paths go
through ``connect_writable()`` (which sets ``PRAGMA foreign_keys=ON`` centrally,
verified below); the sync paths set it themselves. It matters in both
directions — attempts must cascade away with a purged track, and an INSERT
referencing a vanished track must fail loudly instead of orphaning a row.

Rows are NEVER hard-deleted here: "clear" flips ``hidden``.
"""
from __future__ import annotations

import datetime as _dt
import logging
import sqlite3
from typing import Any, Optional

import aiosqlite

from beatos_core.db import connect_writable, resolve_db_path

log = logging.getLogger(__name__)


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


# --- attempts ---------------------------------------------------------------

_ATTEMPT_COLS = (
    "id, job_id, track_id, platform, account, mode, dry_run, outcome, stage, "
    "message, listing_url, hidden, created_at, finished_at"
)

# `outcome` / `listing_url` / `finished_at` are STICKY on update: a job that
# reaches a terminal state and is then re-persisted (orphan reap, a late
# progress emission) must not have its verdict blanked back to ''/NULL.
_UPSERT_ATTEMPT_SQL = """
INSERT INTO publish_attempt
    (job_id, track_id, platform, account, mode, dry_run, outcome, stage,
     message, listing_url, created_at, finished_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(job_id) DO UPDATE SET
    stage       = excluded.stage,
    message     = excluded.message,
    outcome     = CASE WHEN excluded.outcome = '' THEN publish_attempt.outcome
                       ELSE excluded.outcome END,
    listing_url = COALESCE(excluded.listing_url, publish_attempt.listing_url),
    finished_at = COALESCE(excluded.finished_at, publish_attempt.finished_at)
"""


def _attempt_params(
    *,
    job_id: str,
    track_id: int,
    platform: str,
    account: str,
    mode: str,
    dry_run: bool,
    stage: str,
    message: str,
    outcome: Optional[str],
    listing_url: Optional[str],
    created_at: Optional[str],
    finished_at: Optional[str],
) -> tuple:
    return (
        job_id,
        int(track_id),
        platform or "",
        account or "default",
        mode or "engine",
        1 if dry_run else 0,
        outcome or "",
        stage or "",
        message or "",
        listing_url or None,
        created_at or _now(),
        finished_at or None,
    )


def _attempt_row_to_dict(row: tuple) -> dict[str, Any]:
    return {
        "id": row[0],
        "job_id": row[1],
        "track_id": row[2],
        "platform": row[3],
        "account": row[4],
        "mode": row[5],
        "dry_run": bool(row[6]),
        "outcome": row[7],
        "stage": row[8],
        "message": row[9],
        "listing_url": row[10],
        "hidden": bool(row[11]),
        "created_at": row[12],
        "finished_at": row[13],
    }


async def upsert_attempt(
    *,
    job_id: str,
    track_id: int,
    platform: str,
    account: str = "default",
    mode: str = "engine",
    dry_run: bool = False,
    stage: str,
    message: str = "",
    outcome: Optional[str] = None,
    listing_url: Optional[str] = None,
    created_at: Optional[str] = None,
    finished_at: Optional[str] = None,
) -> int:
    """Create-or-update the attempt row for `job_id`; returns its id.

    `created_at` is honoured only on INSERT (the conflict branch never touches
    it), so a job's history keeps the moment the job was created.
    """
    params = _attempt_params(
        job_id=job_id, track_id=track_id, platform=platform, account=account,
        mode=mode, dry_run=dry_run, stage=stage, message=message,
        outcome=outcome, listing_url=listing_url, created_at=created_at,
        finished_at=finished_at,
    )
    async with connect_writable() as conn:
        await conn.execute(_UPSERT_ATTEMPT_SQL, params)
        await conn.commit()
        attempt_id = await _attempt_id_for_job(conn, job_id)
    if attempt_id is None:  # pragma: no cover — the upsert just succeeded
        raise RuntimeError(f"publish_attempt vanished after upsert ({job_id})")
    return attempt_id


def upsert_attempt_sync(
    *,
    job_id: str,
    track_id: int,
    platform: str,
    account: str = "default",
    mode: str = "engine",
    dry_run: bool = False,
    stage: str,
    message: str = "",
    outcome: Optional[str] = None,
    listing_url: Optional[str] = None,
    created_at: Optional[str] = None,
    finished_at: Optional[str] = None,
) -> Optional[int]:
    """Blocking twin of :func:`upsert_attempt` for the Pro persistence thread."""
    params = _attempt_params(
        job_id=job_id, track_id=track_id, platform=platform, account=account,
        mode=mode, dry_run=dry_run, stage=stage, message=message,
        outcome=outcome, listing_url=listing_url, created_at=created_at,
        finished_at=finished_at,
    )
    with sqlite3.connect(resolve_db_path(), timeout=5) as conn:
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute(_UPSERT_ATTEMPT_SQL, params)
        row = conn.execute(
            "SELECT id FROM publish_attempt WHERE job_id = ?", (job_id,)
        ).fetchone()
    return int(row[0]) if row else None


async def _attempt_id_for_job(
    conn: aiosqlite.Connection, job_id: str
) -> Optional[int]:
    async with conn.execute(
        "SELECT id FROM publish_attempt WHERE job_id = ?", (job_id,)
    ) as cur:
        row = await cur.fetchone()
    return int(row[0]) if row else None


# --- field reports ----------------------------------------------------------

_UPSERT_REPORT_SQL = """
INSERT INTO publish_field_report
    (attempt_id, page, field_key, label, outcome, source, value, reason,
     duration_ms, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(attempt_id, page, field_key) DO UPDATE SET
    label       = excluded.label,
    outcome     = excluded.outcome,
    source      = excluded.source,
    value       = excluded.value,
    reason      = excluded.reason,
    duration_ms = excluded.duration_ms,
    updated_at  = excluded.updated_at
"""

# Wire outcome value -> counts key. The extension speaks HYPHEN ("needs-user").
_COUNT_KEYS = {
    "filled": "filled",
    "skipped": "skipped",
    "needs-user": "needs_user",
    "failed": "failed",
}

_EMPTY_COUNTS = {"filled": 0, "skipped": 0, "needs_user": 0, "failed": 0}


def _text(value: Any) -> str:
    if value is None:
        return ""
    return value if isinstance(value, str) else str(value)


def _duration(value: Any) -> Optional[int]:
    if value is None or isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _report_rows(attempt_id: int, reports: list[dict], now: str) -> list[tuple]:
    """Map the extension's wire dicts onto DB rows, defensively.

    The wire shape is ``{page?, field_id, label?, outcome?, source?, value?,
    reason?, duration_ms?}``; `field_id` is the field key. `field_key` / `key`
    are accepted as aliases, and `status` as an alias for `outcome` (the P1
    panel emits it). Entries with no field key are SKIPPED — they can't be
    keyed, so they'd accumulate duplicates.
    """
    rows: list[tuple] = []
    for report in reports:
        if not isinstance(report, dict):
            continue
        field_key = _text(
            report.get("field_id")
            or report.get("field_key")
            or report.get("key")
        ).strip()
        if not field_key:
            continue
        rows.append((
            attempt_id,
            _text(report.get("page")),
            field_key,
            _text(report.get("label")),
            _text(report.get("outcome") if report.get("outcome") is not None
                  else report.get("status")),
            _text(report.get("source")),
            _text(report.get("value")),
            _text(report.get("reason")),
            _duration(report.get("duration_ms")),
            now,
        ))
    return rows


async def upsert_field_reports(job_id: str, reports: list[dict]) -> int:
    """Upsert a job's field reports; returns how many rows were written.

    Idempotent on (attempt_id, page, field_key) — the cumulative protocol
    re-sends the FULL list on every POST, which updates in place instead of
    appending. Returns 0 when the job has no attempt row yet (nothing to hang
    the reports off; recording must never be fatal to a publish).
    """
    now = _now()
    async with connect_writable() as conn:
        attempt_id = await _attempt_id_for_job(conn, job_id)
        if attempt_id is None:
            log.debug("no publish_attempt for job %s; dropping field reports", job_id)
            return 0
        rows = _report_rows(attempt_id, reports, now)
        if not rows:
            return 0
        await conn.executemany(_UPSERT_REPORT_SQL, rows)
        await conn.commit()
    return len(rows)


def upsert_field_reports_sync(job_id: str, reports: list[dict]) -> int:
    """Blocking twin of :func:`upsert_field_reports` for the Pro thread."""
    now = _now()
    with sqlite3.connect(resolve_db_path(), timeout=5) as conn:
        conn.execute("PRAGMA foreign_keys=ON")
        row = conn.execute(
            "SELECT id FROM publish_attempt WHERE job_id = ?", (job_id,)
        ).fetchone()
        if row is None:
            log.debug("no publish_attempt for job %s; dropping field reports", job_id)
            return 0
        rows = _report_rows(int(row[0]), reports, now)
        if not rows:
            return 0
        conn.executemany(_UPSERT_REPORT_SQL, rows)
    return len(rows)


# --- reads ------------------------------------------------------------------

async def _counts_for(
    conn: aiosqlite.Connection, attempt_ids: list[int]
) -> dict[int, dict[str, int]]:
    counts = {aid: dict(_EMPTY_COUNTS) for aid in attempt_ids}
    if not attempt_ids:
        return counts
    placeholders = ",".join("?" * len(attempt_ids))
    async with conn.execute(
        "SELECT attempt_id, outcome, COUNT(*) FROM publish_field_report "
        f"WHERE attempt_id IN ({placeholders}) GROUP BY attempt_id, outcome",
        tuple(attempt_ids),
    ) as cur:
        rows = await cur.fetchall()
    for attempt_id, outcome, n in rows:
        key = _COUNT_KEYS.get(outcome)
        if key is not None:
            counts[attempt_id][key] += n
    return counts


async def list_attempts(
    *,
    track_id: Optional[int] = None,
    limit: int = 50,
    include_hidden: bool = False,
) -> list[dict[str, Any]]:
    """Newest-first attempts, each with `track_title` and a `counts` summary of
    its field-report outcomes."""
    sql = (
        f"SELECT {', '.join('a.' + c for c in _ATTEMPT_COLS.split(', '))}, "
        "COALESCE(t.title, '') FROM publish_attempt a "
        "LEFT JOIN track t ON t.id = a.track_id"
    )
    where: list[str] = []
    params: list[Any] = []
    if track_id is not None:
        where.append("a.track_id = ?")
        params.append(int(track_id))
    if not include_hidden:
        where.append("a.hidden = 0")
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY a.created_at DESC, a.id DESC LIMIT ?"
    params.append(max(0, int(limit)))

    async with connect_writable() as conn:
        async with conn.execute(sql, tuple(params)) as cur:
            rows = await cur.fetchall()
        attempts = []
        for row in rows:
            item = _attempt_row_to_dict(row)
            item["track_title"] = row[14]
            attempts.append(item)
        counts = await _counts_for(conn, [a["id"] for a in attempts])
    for attempt in attempts:
        attempt["counts"] = counts[attempt["id"]]
    return attempts


async def get_attempt(attempt_id: int) -> Optional[dict[str, Any]]:
    """One attempt with `track_title`, `counts` and its `field_reports`
    (ordered by page, then field key). None when the id is unknown."""
    async with connect_writable() as conn:
        async with conn.execute(
            f"SELECT {', '.join('a.' + c for c in _ATTEMPT_COLS.split(', '))}, "
            "COALESCE(t.title, '') FROM publish_attempt a "
            "LEFT JOIN track t ON t.id = a.track_id WHERE a.id = ?",
            (int(attempt_id),),
        ) as cur:
            row = await cur.fetchone()
        if row is None:
            return None
        attempt = _attempt_row_to_dict(row)
        attempt["track_title"] = row[14]
        async with conn.execute(
            "SELECT id, attempt_id, page, field_key, label, outcome, source, "
            "value, reason, duration_ms, updated_at FROM publish_field_report "
            "WHERE attempt_id = ? ORDER BY page ASC, field_key ASC",
            (attempt["id"],),
        ) as cur:
            report_rows = await cur.fetchall()
        counts = await _counts_for(conn, [attempt["id"]])
    attempt["counts"] = counts[attempt["id"]]
    attempt["field_reports"] = [
        {
            "id": r[0],
            "attempt_id": r[1],
            "page": r[2],
            "field_key": r[3],
            "label": r[4],
            "outcome": r[5],
            "source": r[6],
            "value": r[7],
            "reason": r[8],
            "duration_ms": r[9],
            "updated_at": r[10],
        }
        for r in report_rows
    ]
    return attempt


async def set_hidden(attempt_id: int, hidden: bool) -> bool:
    """Soft-hide (or un-hide) one attempt. False when the id is unknown.

    History is NEVER hard-deleted here — the UI's "clear" is this flag.
    """
    async with connect_writable() as conn:
        cur = await conn.execute(
            "UPDATE publish_attempt SET hidden = ? WHERE id = ?",
            (1 if hidden else 0, int(attempt_id)),
        )
        changed = cur.rowcount
        await cur.close()
        await conn.commit()
    return bool(changed)
