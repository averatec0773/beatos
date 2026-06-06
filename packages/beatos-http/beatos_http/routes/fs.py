"""Local filesystem browse + download endpoints for the web frontend.

LOCAL-ONLY: the sidecar runs on the user's own machine, so these expose that
machine's filesystem over the same-origin localhost API (CORS-gated, like the
existing attach route which already accepts arbitrary absolute paths). They MUST
be gated off / replaced with uploads if a remote-access mode is ever added.
"""
from __future__ import annotations

import os
import pathlib
import subprocess
import sys

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


class PathPayload(BaseModel):
    path: str


def _existing(path: str) -> pathlib.Path:
    p = pathlib.Path(path).expanduser()
    if not p.exists():
        raise HTTPException(status_code=404, detail="Path not found.")
    return p


@router.post("/api/fs/reveal")
async def fs_reveal(payload: PathPayload) -> dict:
    """Reveal a file/folder in the OS file manager (Finder/Explorer)."""
    p = _existing(payload.path)
    try:
        if sys.platform == "darwin":
            subprocess.run(["open", "-R", str(p)], check=False)
        elif sys.platform.startswith("win"):
            subprocess.run(["explorer", "/select," + str(p)], check=False)
        else:
            subprocess.run(["xdg-open", str(p.parent)], check=False)
    except OSError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True}


@router.post("/api/fs/open")
async def fs_open(payload: PathPayload) -> dict:
    """Open a file/folder with the OS default handler. Returns {ok, error?}
    (mirrors the Electron shell.openPath contract: empty error == success)."""
    p = _existing(payload.path)
    try:
        if sys.platform == "darwin":
            subprocess.run(["open", str(p)], check=False)
        elif sys.platform.startswith("win"):
            os.startfile(str(p))  # type: ignore[attr-defined]
        else:
            subprocess.run(["xdg-open", str(p)], check=False)
    except OSError as e:
        return {"ok": False, "error": str(e)}
    return {"ok": True}
