import zipfile

import pytest

from beatos_core.assets.service import attach_asset
from beatos_core.db import run_migrations
from beatos_core.lists.export import build_export_manifest, package_list
from beatos_core.lists.membership import add_track_to_list
from beatos_core.lists.service import create_list
from beatos_core.tracks.service import create_track


@pytest.fixture
async def db(tmp_path, monkeypatch):
    p = tmp_path / "t.db"
    await run_migrations(p)
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    return p


async def _track_with_files(tmp_path, title, files):
    """files: list of (role, ext). Returns track id."""
    t = await create_track(title)
    for role, ext in files:
        f = tmp_path / f"{title}_{role}{ext}"
        f.write_bytes(b"RIFFfake" + role.encode())
        await attach_asset(t.id, role, str(f))
    return t.id


@pytest.fixture
async def populated_list(db, tmp_path):
    lst = await create_list("BEATTAPE")
    a = await _track_with_files(tmp_path, "PAINLUV", [("audio_tagged", ".wav"), ("loop", ".wav")])
    b = await _track_with_files(tmp_path, "ANOTHER", [("audio_untagged", ".mp3")])
    await add_track_to_list(a, lst.id)
    await add_track_to_list(b, lst.id)
    return {"list_id": lst.id, "a": a, "b": b}


@pytest.mark.asyncio
async def test_manifest_lists_packageable_files(populated_list):
    manifest = await build_export_manifest(populated_list["list_id"])
    titles = {m["title"]: m for m in manifest}
    assert set(titles) == {"PAINLUV", "ANOTHER"}
    roles = {f["role"] for f in titles["PAINLUV"]["files"]}
    assert roles == {"audio_tagged", "loop"}


@pytest.mark.asyncio
async def test_package_zip_per_track_subfolders(populated_list, tmp_path):
    dest = tmp_path / "out"
    dest.mkdir()
    manifest = await build_export_manifest(populated_list["list_id"])
    items = [
        {"track_id": m["track_id"], "asset_ids": [f["asset_id"] for f in m["files"]]}
        for m in manifest
    ]
    res = await package_list(populated_list["list_id"], items, mode="zip", dest=str(dest))
    assert res["file_count"] == 3
    assert res["skipped"] == []
    with zipfile.ZipFile(res["output_path"]) as zf:
        names = set(zf.namelist())
    # Per-track subfolders; the two PAINLUV .wav collide on title+ext so the loop
    # one gets the role suffix.
    assert "PAINLUV/PAINLUV.wav" in names
    assert "PAINLUV/PAINLUV_loop.wav" in names
    assert "ANOTHER/ANOTHER.mp3" in names


@pytest.mark.asyncio
async def test_package_folder_copies_selected_only(populated_list, tmp_path):
    dest = tmp_path / "out"
    dest.mkdir()
    manifest = await build_export_manifest(populated_list["list_id"])
    # Only the first track, only its first file.
    first = manifest[0] if manifest[0]["title"] == "PAINLUV" else manifest[1]
    items = [{"track_id": first["track_id"], "asset_ids": [first["files"][0]["asset_id"]]}]
    res = await package_list(populated_list["list_id"], items, mode="folder", dest=str(dest))
    assert res["file_count"] == 1
    out = res["output_path"]
    import pathlib

    copied = list(pathlib.Path(out).rglob("*"))
    files = [p for p in copied if p.is_file()]
    assert len(files) == 1
    assert files[0].parent.name == "PAINLUV"


@pytest.mark.asyncio
async def test_package_rejects_empty_selection(populated_list, tmp_path):
    dest = tmp_path / "out"
    dest.mkdir()
    with pytest.raises(ValueError, match="Nothing to package"):
        await package_list(populated_list["list_id"], [], mode="zip", dest=str(dest))


@pytest.mark.asyncio
async def test_package_bad_dest(populated_list, tmp_path):
    manifest = await build_export_manifest(populated_list["list_id"])
    items = [{"track_id": m["track_id"], "asset_ids": [f["asset_id"] for f in m["files"]]} for m in manifest]
    with pytest.raises(ValueError, match="Destination folder"):
        await package_list(populated_list["list_id"], items, mode="zip", dest=str(tmp_path / "nope"))
