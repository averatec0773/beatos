"""Playlist (list) file packaging.

Bundle a list's selected track files into a ZIP or a plain folder for hand-off —
a beat pack to send a singer, a loopkit, etc. Layout is one subfolder per track:
``<ListName>/<TrackTitle>/<file>``. Local filesystem only, never a platform
upload. Uses stdlib zip/copy — no web/RPC/Electron deps (rule 2)."""
from __future__ import annotations

import asyncio
import pathlib
import re
import shutil
import zipfile

from beatos_core.assets.service import list_assets_for_track
from beatos_core.lists.membership import tracks_in_list
from beatos_core.lists.service import get_list

# Roles a producer would ship. The cover is excluded (artwork, not a deliverable).
_PACKAGEABLE = frozenset({
    "audio_tagged_wav",
    "audio_untagged_wav",
    "audio_tagged_mp3",
    "audio_untagged_mp3",
    "loop",
    "stems",
})

_ILLEGAL = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def _sanitize(name: str, fallback: str) -> str:
    """Make a string safe as a single path component (no separators / illegal
    chars / trailing dots-spaces). Falls back when nothing usable remains."""
    cleaned = _ILLEGAL.sub("_", (name or "").strip()).rstrip(". ")
    return cleaned or fallback


async def build_export_manifest(list_id: int) -> list[dict]:
    """Per-track packageable files for the export dialog's checkboxes."""
    tracks = await tracks_in_list(list_id)
    out: list[dict] = []
    for t in tracks:
        assets = await list_assets_for_track(t.id)
        files = [
            {
                "asset_id": a.id,
                "role": a.role,
                "filename": pathlib.Path(a.abs_path).name,
                "size_bytes": a.size_bytes,
                "missing": a.missing,
            }
            for a in assets
            if a.role in _PACKAGEABLE
        ]
        out.append({"track_id": t.id, "title": t.title, "files": files})
    return out


def _plan_track_filenames(title: str, track_id: int, assets: list) -> dict[int, str]:
    """asset_id → output filename inside the track folder. Names are the
    sanitized track title + original extension; on collision (two roles sharing
    an extension, e.g. tagged+untagged wav) the role is appended."""
    base = _sanitize(title, f"track_{track_id}")
    used: set[str] = set()
    plan: dict[int, str] = {}
    for a in assets:
        ext = pathlib.Path(a.abs_path).suffix
        name = f"{base}{ext}"
        if name.lower() in used:
            name = f"{base}_{a.role}{ext}"
        used.add(name.lower())
        plan[a.id] = name
    return plan


def _dedupe_path(p: pathlib.Path) -> pathlib.Path:
    """Avoid clobbering an existing output by suffixing ' (2)', ' (3)', ..."""
    if not p.exists():
        return p
    stem, suffix, parent = p.stem, p.suffix, p.parent
    i = 2
    while True:
        cand = parent / f"{stem} ({i}){suffix}"
        if not cand.exists():
            return cand
        i += 1


def _write_zip(out_path: pathlib.Path, entries: list[tuple[str, str, pathlib.Path]]) -> None:
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for folder, name, abs_path in entries:
            zf.write(abs_path, arcname=f"{folder}/{name}")


def _copy_tree(out_dir: pathlib.Path, entries: list[tuple[str, str, pathlib.Path]]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for folder, name, abs_path in entries:
        d = out_dir / folder
        d.mkdir(parents=True, exist_ok=True)
        shutil.copy2(abs_path, d / name)


async def package_list(
    list_id: int,
    items: list[dict],
    *,
    mode: str,
    dest: str,
) -> dict:
    """Package selected files. ``items`` is ``[{"track_id", "asset_ids": [...]}]``;
    ``mode`` is ``'zip'`` or ``'folder'``; output is written under ``dest``.
    Missing files are skipped (reported). Returns
    ``{output_path, file_count, skipped}``."""
    if mode not in ("zip", "folder"):
        raise ValueError(f"mode must be 'zip' or 'folder'; got {mode!r}")
    dest_dir = pathlib.Path(dest)
    if not dest_dir.is_dir():
        raise ValueError(f"Destination folder does not exist: {dest}")

    lst = await get_list(list_id)
    if lst is None:
        raise ValueError(f"List {list_id} not found.")
    list_name = _sanitize(lst.name, f"list_{list_id}")

    selected = {it["track_id"]: set(it.get("asset_ids") or []) for it in items}

    entries: list[tuple[str, str, pathlib.Path]] = []
    skipped: list[str] = []
    for t in await tracks_in_list(list_id):
        want = selected.get(t.id)
        if not want:
            continue
        assets = [
            a
            for a in await list_assets_for_track(t.id)
            if a.id in want and a.role in _PACKAGEABLE
        ]
        plan = _plan_track_filenames(t.title, t.id, assets)
        folder = _sanitize(t.title, f"track_{t.id}")
        for a in assets:
            p = pathlib.Path(a.abs_path)
            if a.missing or not p.exists():
                skipped.append(f"{t.title} / {plan[a.id]} (missing)")
                continue
            entries.append((folder, plan[a.id], p))

    if not entries:
        raise ValueError("Nothing to package: no existing files were selected.")

    if mode == "zip":
        out_path = _dedupe_path(dest_dir / f"{list_name}.zip")
        await asyncio.to_thread(_write_zip, out_path, entries)
    else:
        out_path = _dedupe_path(dest_dir / list_name)
        await asyncio.to_thread(_copy_tree, out_path, entries)

    return {"output_path": str(out_path), "file_count": len(entries), "skipped": skipped}
