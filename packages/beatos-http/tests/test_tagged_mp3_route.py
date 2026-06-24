"""EPIC-D13-2: POST /api/tracks/{id}/tagged-mp3 route."""
from __future__ import annotations

import io

import pytest
from fastapi import HTTPException
from mutagen.id3 import ID3

from beatos_core.assets.service import attach_asset
from beatos_core.db import run_migrations
from beatos_core.tracks.service import create_track

from beatos_http.routes.tagged_mp3 import _TaggedMp3Request, tagged_mp3

_MP3 = b"\xff\xfb\x90\x00" + b"\x00" * 4096


@pytest.fixture
def db(tmp_path, monkeypatch):
    p = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    return p


async def test_track_not_found_404(db):
    await run_migrations(db)
    with pytest.raises(HTTPException) as ei:
        await tagged_mp3(99999, _TaggedMp3Request(asset_id=1))
    assert ei.value.status_code == 404


async def test_returns_tagged_mp3(db, tmp_path):
    await run_migrations(db)
    t = await create_track("Midnight Drive")
    mp3 = tmp_path / "beat.mp3"
    mp3.write_bytes(_MP3)
    a = await attach_asset(t.id, "audio_tagged", mp3)
    assert a.format == "mp3"

    resp = await tagged_mp3(t.id, _TaggedMp3Request(asset_id=a.id))
    assert resp.status_code == 200
    assert resp.media_type == "audio/mpeg"
    tags = ID3(io.BytesIO(resp.body))
    assert tags["TIT2"].text[0] == "Midnight Drive"
    assert "attachment" in resp.headers["content-disposition"]


async def test_non_mp3_asset_400(db, tmp_path):
    await run_migrations(db)
    t = await create_track("Beat")
    wav = tmp_path / "beat.wav"
    wav.write_bytes(b"RIFF\x00\x00\x00\x00WAVE" + b"\x00" * 64)
    a = await attach_asset(t.id, "audio_tagged", wav)
    assert a.format == "wav"
    with pytest.raises(HTTPException) as ei:
        await tagged_mp3(t.id, _TaggedMp3Request(asset_id=a.id))
    assert ei.value.status_code == 400


async def test_asset_of_other_track_404(db, tmp_path):
    await run_migrations(db)
    a_tr = await create_track("A")
    b_tr = await create_track("B")
    mp3 = tmp_path / "b.mp3"
    mp3.write_bytes(_MP3)
    asset = await attach_asset(b_tr.id, "audio_tagged", mp3)
    with pytest.raises(HTTPException) as ei:
        await tagged_mp3(a_tr.id, _TaggedMp3Request(asset_id=asset.id))
    assert ei.value.status_code == 404
