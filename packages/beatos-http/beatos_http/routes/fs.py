"""Local filesystem browse + download endpoints for the web frontend.

LOCAL-ONLY: the sidecar runs on the user's own machine, so these expose that
machine's filesystem over the same-origin localhost API (CORS-gated, like the
existing attach route which already accepts arbitrary absolute paths). They MUST
be gated off / replaced with uploads if a remote-access mode is ever added.
"""
from __future__ import annotations

import pathlib

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

router = APIRouter(tags=["fs"])


class FsEntry(BaseModel):
    name: str
    path: str
    is_dir: bool
    size: int | None = None
    ext: str | None = None


class FsListing(BaseModel):
    cwd: str
    parent: str | None
    entries: list[FsEntry]


def _resolve_dir(path: str | None) -> pathlib.Path:
    target = pathlib.Path(path).expanduser() if path else pathlib.Path.home()
    try:
        target = target.resolve()
    except OSError:
        raise HTTPException(status_code=400, detail="Invalid path.")
    if not target.exists() or not target.is_dir():
        raise HTTPException(status_code=404, detail="Not a directory.")
    return target


@router.get("/api/fs/list", response_model=FsListing)
async def fs_list(path: str | None = Query(default=None)) -> FsListing:
    target = _resolve_dir(path)
    entries: list[FsEntry] = []
    try:
        children = sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied.")
    for child in children:
        if child.name.startswith("."):
            continue  # hide dotfiles
        try:
            is_dir = child.is_dir()
            size = None if is_dir else child.stat().st_size
        except OSError:
            continue  # skip unreadable entries rather than failing the listing
        entries.append(
            FsEntry(
                name=child.name,
                path=str(child),
                is_dir=is_dir,
                size=size,
                ext=(child.suffix.lower().lstrip(".") or None) if not is_dir else None,
            )
        )
    parent = str(target.parent) if target.parent != target else None
    return FsListing(cwd=str(target), parent=parent, entries=entries)


@router.get("/api/fs/download")
async def fs_download(path: str = Query(...)) -> FileResponse:
    try:
        p = pathlib.Path(path).expanduser().resolve()
    except OSError:
        raise HTTPException(status_code=400, detail="Invalid path.")
    if not p.exists() or not p.is_file():
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(p, filename=p.name, media_type="application/octet-stream")
