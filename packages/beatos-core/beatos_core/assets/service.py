"""Asset attach / detach / relocate / missing sweep.

All operations target the currently-active library (via beatos_core.state).
Linked-first: every new asset is stored with mode='linked' and the user's
original file is left untouched on disk.
"""
from __future__ import annotations

import datetime as _dt
import mimetypes
import pathlib
from typing import Optional

import aiosqlite

from beatos_core import state
from beatos_core.assets import ASSET_ROLES, AUDIO_ROLES
from beatos_core.assets.hashing import sha256_file
from beatos_core.assets import metadata as _metadata_mod
from beatos_core.models import Asset

_SELECT_COLS = (
    "a.id, a.track_id, a.role, a.mode, a.abs_path, a.rel_path, a.sha256, "
    "a.size_bytes, a.mime_type, a.missing, a.created_at"
)


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


def _row_to_asset(row: tuple) -> Asset:
    return Asset(
        id=row[0],
        track_id=row[1],
        role=row[2],
        mode=row[3],
        abs_path=row[4],
        rel_path=row[5],
        sha256=row[6],
        size_bytes=row[7],
        mime_type=row[8],
        missing=bool(row[9]),
        created_at=_dt.datetime.fromisoformat(row[10]),
    )


async def _assert_track_in_active_lib(conn: aiosqlite.Connection, track_id: int, library_id: int) -> None:
    async with conn.execute(
        "SELECT 1 FROM track WHERE id = ? AND library_id = ?", (track_id, library_id)
    ) as cur:
        row = await cur.fetchone()
    if row is None:
        raise ValueError(f"Track {track_id} not in active library.")


async def attach_asset(track_id: int, role: str, path: pathlib.Path | str) -> Asset:
    """Attach a Linked asset (the file stays put). Returns the new Asset.

    Side effect: if role='audio' and the track has empty BPM/key, prefill
    from mutagen metadata when available.
    """
    if role not in ASSET_ROLES:
        raise ValueError(f"Invalid role: {role}. Allowed: {sorted(ASSET_ROLES)}")

    active = state.require_active()
    file = pathlib.Path(path).resolve()
    if not file.exists():
        raise ValueError(f"File does not exist: {file}")

    sha = await sha256_file(file)
    size = file.stat().st_size
    mime, _ = mimetypes.guess_type(str(file))

    async with aiosqlite.connect(active.db_path) as conn:
        await _assert_track_in_active_lib(conn, track_id, active.library.id)
        # Reject duplicate role on same track
        async with conn.execute(
            "SELECT 1 FROM asset WHERE track_id = ? AND role = ?", (track_id, role)
        ) as cur:
            if await cur.fetchone() is not None:
                raise ValueError(f"Track already has a {role} asset.")

        async with conn.execute(
            "INSERT INTO asset (track_id, role, mode, abs_path, sha256, size_bytes, "
            "mime_type, missing, created_at) "
            "VALUES (?, ?, 'linked', ?, ?, ?, ?, 0, ?)",
            (track_id, role, str(file), sha, size, mime, _now()),
        ) as cur:
            asset_id = cur.lastrowid
        await conn.commit()

        if role in AUDIO_ROLES:
            await _maybe_prefill_track_metadata(conn, track_id, file)

        async with conn.execute(
            f"SELECT {_SELECT_COLS} FROM asset a WHERE a.id = ?", (asset_id,)
        ) as cur:
            row = await cur.fetchone()
    return _row_to_asset(row)


async def _maybe_prefill_track_metadata(conn: aiosqlite.Connection, track_id: int, file: pathlib.Path) -> None:
    """If track.bpm is null, set it from the audio file's metadata (if any)."""
    meta = _metadata_mod.read_audio_metadata(file)
    if not meta or "bpm" not in meta:
        return
    async with conn.execute("SELECT bpm FROM track WHERE id = ?", (track_id,)) as cur:
        row = await cur.fetchone()
    if row and row[0] is None:
        await conn.execute(
            "UPDATE track SET bpm = ?, updated_at = ? WHERE id = ?",
            (meta["bpm"], _now(), track_id),
        )
        await conn.commit()


async def get_asset(asset_id: int) -> Optional[Asset]:
    active = state.require_active()
    async with aiosqlite.connect(active.db_path) as conn:
        async with conn.execute(
            f"SELECT {_SELECT_COLS} FROM asset a "
            "JOIN track t ON t.id = a.track_id "
            "WHERE a.id = ? AND t.library_id = ?",
            (asset_id, active.library.id),
        ) as cur:
            row = await cur.fetchone()
    return _row_to_asset(row) if row else None


async def list_assets_for_track(track_id: int) -> list[Asset]:
    active = state.require_active()
    async with aiosqlite.connect(active.db_path) as conn:
        await _assert_track_in_active_lib(conn, track_id, active.library.id)
        async with conn.execute(
            f"SELECT {_SELECT_COLS} FROM asset a WHERE a.track_id = ? ORDER BY a.role",
            (track_id,),
        ) as cur:
            rows = await cur.fetchall()
    return [_row_to_asset(r) for r in rows]


async def detach_asset(asset_id: int) -> None:
    """Remove the asset row. File on disk is NOT touched."""
    active = state.require_active()
    async with aiosqlite.connect(active.db_path) as conn:
        await conn.execute(
            "DELETE FROM asset WHERE id = ? AND track_id IN "
            "(SELECT id FROM track WHERE library_id = ?)",
            (asset_id, active.library.id),
        )
        await conn.commit()


async def relocate_asset(asset_id: int, new_path: pathlib.Path | str) -> Asset:
    """Re-link a missing/moved asset.

    Compares sha256: if matches stored, silent re-link. If differs, raises
    ValueError so the caller can prompt the user to confirm replacement.
    """
    asset = await get_asset(asset_id)
    if asset is None:
        raise ValueError(f"Asset {asset_id} not found in active library.")

    new_file = pathlib.Path(new_path).resolve()
    if not new_file.exists():
        raise ValueError(f"File does not exist: {new_file}")

    new_sha = await sha256_file(new_file)
    if asset.sha256 and asset.sha256 != new_sha:
        raise ValueError(
            f"sha256 mismatch: stored={asset.sha256[:8]}..., new={new_sha[:8]}..."
        )

    active = state.require_active()
    async with aiosqlite.connect(active.db_path) as conn:
        await conn.execute(
            "UPDATE asset SET abs_path = ?, sha256 = ?, missing = 0 WHERE id = ?",
            (str(new_file), new_sha, asset_id),
        )
        await conn.commit()
    return (await get_asset(asset_id))  # type: ignore[return-value]


async def missing_sweep() -> dict[str, int]:
    """Check every asset in active library; mark `missing=1` for vanished files.

    Returns {checked, marked_missing, recovered}.
    """
    active = state.require_active()
    checked = 0
    marked = 0
    recovered = 0
    async with aiosqlite.connect(active.db_path) as conn:
        async with conn.execute(
            "SELECT a.id, a.abs_path, a.missing FROM asset a "
            "JOIN track t ON t.id = a.track_id WHERE t.library_id = ?",
            (active.library.id,),
        ) as cur:
            rows = await cur.fetchall()
        for asset_id, abs_path, was_missing in rows:
            checked += 1
            exists = pathlib.Path(abs_path).exists()
            if exists and was_missing:
                await conn.execute(
                    "UPDATE asset SET missing = 0 WHERE id = ?", (asset_id,)
                )
                recovered += 1
            elif not exists and not was_missing:
                await conn.execute(
                    "UPDATE asset SET missing = 1 WHERE id = ?", (asset_id,)
                )
                marked += 1
        await conn.commit()
    return {"checked": checked, "marked_missing": marked, "recovered": recovered}
