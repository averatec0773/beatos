"""Chat conversation + message persistence."""
import pathlib

import pytest
import pytest_asyncio

from beatos_core.db import run_migrations
from beatos_core.chat.service import (
    create_conversation,
    delete_conversation,
    get_conversation,
    list_conversations,
    replace_messages,
    set_conversation_title,
)


@pytest_asyncio.fixture
async def db(tmp_path: pathlib.Path, monkeypatch):
    p = tmp_path / "global.db"
    await run_migrations(p)
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    yield p


@pytest.mark.asyncio
async def test_create_and_get(db):
    cid = await create_conversation()
    conv = await get_conversation(cid)
    assert conv["id"] == cid
    assert conv["messages"] == []


@pytest.mark.asyncio
async def test_replace_messages_roundtrips(db):
    cid = await create_conversation()
    msgs = [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": [{"type": "text", "text": "hello"}]},
    ]
    await replace_messages(cid, msgs)
    conv = await get_conversation(cid)
    assert conv["messages"] == msgs
    await replace_messages(cid, [{"role": "user", "content": "again"}])
    conv2 = await get_conversation(cid)
    assert conv2["messages"] == [{"role": "user", "content": "again"}]


@pytest.mark.asyncio
async def test_list_newest_first_and_title(db):
    a = await create_conversation()
    b = await create_conversation()
    await set_conversation_title(a, "First")
    rows = await list_conversations()
    ids = [r["id"] for r in rows]
    assert set(ids) == {a, b}
    assert any(r["id"] == a and r["title"] == "First" for r in rows)


@pytest.mark.asyncio
async def test_delete_cascades_messages(db):
    cid = await create_conversation()
    await replace_messages(cid, [{"role": "user", "content": "x"}])
    assert await delete_conversation(cid) is True
    assert await get_conversation(cid) is None
    assert await delete_conversation(cid) is False


@pytest.mark.asyncio
async def test_get_missing_is_none(db):
    assert await get_conversation(999999) is None
