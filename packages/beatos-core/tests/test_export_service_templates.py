import datetime as dt

import pytest

from beatos_core.db import run_migrations
from beatos_core.app_settings.service import set_setting
from beatos_core.export.service import export_metadata


@pytest.fixture
async def db(tmp_path, monkeypatch):
    p = tmp_path / "t.db"
    await run_migrations(p)
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    import aiosqlite
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(p) as conn:
        await conn.execute(
            "INSERT INTO track (id, title, genre, created_at, updated_at) "
            "VALUES (1, '仙泉', '[\"Chinese Style\"]', ?, ?)",
            (now, now),
        )
        await conn.execute(
            "INSERT INTO track (id, title, producer, created_at, updated_at) "
            "VALUES (2, '夜行', '[\"Averatec\", \"Redketch\"]', ?, ?)",
            (now, now),
        )
        await conn.commit()
    return p


def _fields(result):
    return {f.key: f for f in result.fields}


@pytest.mark.asyncio
async def test_defaults_used_when_setting_absent(db):
    r = await export_metadata(1, "netease")
    f = _fields(r)
    assert f["title"].value == '[FREE] "仙泉" - 国风 TYPE BEAT'
    assert "album_name" in f


@pytest.mark.asyncio
async def test_custom_setting_overrides(db):
    await set_setting("upload_templates", {"beat_name": "JUST {title}"})
    r = await export_metadata(1, "netease")
    assert _fields(r)["title"].value == "JUST 仙泉"
    assert "album_name" in _fields(r)


@pytest.mark.asyncio
async def test_year_token_uses_current_year(db, monkeypatch):
    import beatos_core.export.service as svc
    monkeypatch.setattr(svc, "_current_year", lambda: 2030)
    await set_setting("upload_templates", {"album_name": "{year} {title}"})
    r = await export_metadata(1, "netease")
    assert _fields(r)["album_name"].value == "2030 仙泉"


@pytest.mark.asyncio
async def test_prod_uses_track_producer_joined(db):
    await set_setting("upload_templates", {"beat_description": "Prod.{prod}"})
    r = await export_metadata(2, "netease")
    assert _fields(r)["description"].value == "Prod.Averatec x Redketch"


@pytest.mark.asyncio
async def test_prod_custom_separator(db):
    await set_setting("upload_templates", {"beat_description": "Prod.{prod}", "prod_separator": " & "})
    r = await export_metadata(2, "netease")
    assert _fields(r)["description"].value == "Prod.Averatec & Redketch"


@pytest.mark.asyncio
async def test_prod_falls_back_to_setting_when_no_producer(db):
    await set_setting("upload_templates", {"beat_description": "Prod.{prod}", "prod": "Fallback"})
    r = await export_metadata(1, "netease")
    assert _fields(r)["description"].value == "Prod.Fallback"


@pytest.mark.asyncio
async def test_publish_date_injected(db, monkeypatch):
    import beatos_core.export.service as svc
    monkeypatch.setattr(svc, "_current_date", lambda: "2030-01-02")
    await set_setting("upload_templates", {"album_description": "{publish date}"})
    r = await export_metadata(1, "netease")
    assert _fields(r)["album_description"].value == "2030-01-02"
