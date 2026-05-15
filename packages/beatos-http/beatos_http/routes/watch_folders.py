"""/api/watch-folders routes — register / scan / remove."""
from __future__ import annotations

import datetime as _dt
import pathlib
from typing import Any, Literal, Optional

import aiosqlite
from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from beatos_core import state
from beatos_core.watcher.scanner import scan_folder

router = APIRouter(prefix="/api/watch-folders", tags=["watch_folders"])


def _require_active():
    a = state.get_active()
    if a is None:
        raise HTTPException(status_code=409, detail="No active library.")
    return a


class AddFolderPayload(BaseModel):
    path: str


class ScanExistingPayload(BaseModel):
    action: Literal["import_all", "skip", "pick"]
    track_paths: Optional[list[str]] = None


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


@router.get("")
async def list_folders() -> list[dict[str, Any]]:
    active = _require_active()
    async with aiosqlite.connect(active.db_path) as conn:
        async with conn.execute(
            "SELECT id, library_id, path, auto_import FROM watch_folder WHERE library_id = ?",
            (active.library.id,),
        ) as cur:
            rows = await cur.fetchall()
    return [
        {"id": r[0], "library_id": r[1], "path": r[2], "auto_import": bool(r[3])}
        for r in rows
    ]


@router.post("")
async def add_folder(payload: AddFolderPayload) -> dict[str, Any]:
    active = _require_active()
    folder = pathlib.Path(payload.path).resolve()
    if not folder.exists() or not folder.is_dir():
        raise HTTPException(status_code=400, detail=f"Not a directory: {folder}")

    async with aiosqlite.connect(active.db_path) as conn:
        async with conn.execute(
            "INSERT INTO watch_folder (library_id, path, auto_import) VALUES (?, ?, 1)",
            (active.library.id, str(folder)),
        ) as cur:
            folder_id = cur.lastrowid
        await conn.commit()

    found = await scan_folder(folder)
    return {"folder_id": folder_id, "path": str(folder), "found_files": found}


@router.post("/{folder_id}/scan-existing")
async def scan_existing(folder_id: int, payload: ScanExistingPayload) -> dict[str, int]:
    active = _require_active()

    if payload.action == "skip":
        return {"imported": 0}

    async with aiosqlite.connect(active.db_path) as conn:
        async with conn.execute(
            "SELECT path FROM watch_folder WHERE id = ? AND library_id = ?",
            (folder_id, active.library.id),
        ) as cur:
            row = await cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Folder not found.")
    folder_path = pathlib.Path(row[0])

    scanned = await scan_folder(folder_path)
    targets = (
        scanned
        if payload.action == "import_all"
        else [f for f in scanned if f["path"] in set(payload.track_paths or [])]
    )

    imported = 0
    async with aiosqlite.connect(active.db_path) as conn:
        for entry in targets:
            sha = entry["sha256"]
            # Dedup
            async with conn.execute(
                "SELECT 1 FROM asset WHERE sha256 = ?", (sha,)
            ) as cur:
                if await cur.fetchone() is not None:
                    continue
            title = pathlib.Path(entry["path"]).stem
            bpm = entry.get("bpm")
            now = _now()
            async with conn.execute(
                "INSERT INTO track (library_id, title, license_type, bpm, created_at, updated_at) "
                "VALUES (?, ?, 'lease_basic', ?, ?, ?)",
                (active.library.id, title, bpm, now, now),
            ) as cur:
                track_id = cur.lastrowid
            await conn.execute(
                "INSERT INTO asset (track_id, role, mode, abs_path, sha256, size_bytes, "
                "mime_type, missing, created_at) "
                "VALUES (?, 'audio', 'linked', ?, ?, ?, 'audio/wav', 0, ?)",
                (track_id, entry["path"], sha, entry.get("size_bytes"), now),
            )
            imported += 1
        await conn.commit()
    return {"imported": imported}


@router.delete("/{folder_id}", status_code=204)
async def remove_folder(folder_id: int) -> Response:
    active = _require_active()
    async with aiosqlite.connect(active.db_path) as conn:
        await conn.execute(
            "DELETE FROM watch_folder WHERE id = ? AND library_id = ?",
            (folder_id, active.library.id),
        )
        await conn.commit()
    return Response(status_code=204)
