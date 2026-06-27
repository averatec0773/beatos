"""Read tool catalog for the in-app chat."""
import pytest

from beatos_core.db import run_migrations
from beatos_core.tracks.service import create_track

from beatos_http.ai.chat_tools import (
    UnknownToolError,
    anthropic_tool_defs,
    execute_tool,
)


@pytest.fixture
def db(tmp_path, monkeypatch):
    p = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    return p


def test_anthropic_tool_defs_shape():
    defs = anthropic_tool_defs()
    assert {d["name"] for d in defs} == {"search_tracks", "get_track", "list_distinct_values"}
    for d in defs:
        assert set(d) == {"name", "description", "input_schema"}
        assert d["input_schema"]["type"] == "object"


@pytest.mark.asyncio
async def test_search_tracks_returns_serializable_list(db):
    await run_migrations(db)
    await create_track("Midnight Drive")
    out = await execute_tool("search_tracks", {"q": "Midnight"})
    assert isinstance(out, list)
    assert any(t["title"] == "Midnight Drive" for t in out)


@pytest.mark.asyncio
async def test_get_track_returns_none_for_missing(db):
    await run_migrations(db)
    assert await execute_tool("get_track", {"track_id": 999999}) is None


@pytest.mark.asyncio
async def test_unknown_tool_raises(db):
    await run_migrations(db)
    with pytest.raises(UnknownToolError):
        await execute_tool("nope", {})
