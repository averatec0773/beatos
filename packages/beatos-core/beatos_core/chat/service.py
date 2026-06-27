"""Local persistence for in-app AI chat conversations.

The conversation's Anthropic `messages` array is the source of truth; each turn
replaces it wholesale (`replace_messages`). Pure beatos-core (no web deps).
"""
from __future__ import annotations

import json
import time

import aiosqlite

from beatos_core.db import connect_writable, resolve_db_path


async def create_conversation(title: str = "") -> int:
    now = time.time()
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        cur = await conn.execute(
            "INSERT INTO chat_conversation (title, created_at, updated_at) VALUES (?, ?, ?)",
            (title, now, now),
        )
        await conn.commit()
        return int(cur.lastrowid)


async def set_conversation_title(conversation_id: int, title: str) -> None:
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            "UPDATE chat_conversation SET title = ?, updated_at = ? WHERE id = ?",
            (title, time.time(), conversation_id),
        )
        await conn.commit()


async def list_conversations() -> list[dict]:
    """All conversations, newest-updated first (no messages)."""
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT id, title, created_at, updated_at FROM chat_conversation "
            "ORDER BY updated_at DESC, id DESC"
        ) as cur:
            rows = await cur.fetchall()
    return [
        {"id": r[0], "title": r[1], "created_at": r[2], "updated_at": r[3]} for r in rows
    ]


async def get_conversation(conversation_id: int) -> dict | None:
    """The conversation + its messages (Anthropic array), or None if absent."""
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT id, title, created_at, updated_at FROM chat_conversation WHERE id = ?",
            (conversation_id,),
        ) as cur:
            head = await cur.fetchone()
        if head is None:
            return None
        async with conn.execute(
            "SELECT role, content_json FROM chat_message "
            "WHERE conversation_id = ? ORDER BY id ASC",
            (conversation_id,),
        ) as cur:
            msg_rows = await cur.fetchall()
    messages = [{"role": r[0], "content": json.loads(r[1])} for r in msg_rows]
    return {
        "id": head[0],
        "title": head[1],
        "created_at": head[2],
        "updated_at": head[3],
        "messages": messages,
    }


async def replace_messages(conversation_id: int, messages: list[dict]) -> None:
    """Replace ALL of a conversation's messages with `messages` (the running
    Anthropic array), in one transaction, and bump updated_at."""
    now = time.time()
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute("DELETE FROM chat_message WHERE conversation_id = ?", (conversation_id,))
        for m in messages:
            await conn.execute(
                "INSERT INTO chat_message (conversation_id, role, content_json, created_at) "
                "VALUES (?, ?, ?, ?)",
                (conversation_id, m["role"], json.dumps(m["content"], ensure_ascii=False), now),
            )
        await conn.execute(
            "UPDATE chat_conversation SET updated_at = ? WHERE id = ?", (now, conversation_id)
        )
        await conn.commit()


async def delete_conversation(conversation_id: int) -> bool:
    """Delete a conversation + its messages (FK cascade). Returns whether a row
    was removed. Uses connect_writable so PRAGMA foreign_keys=ON (rule 9)."""
    async with connect_writable() as conn:
        cur = await conn.execute(
            "DELETE FROM chat_conversation WHERE id = ?", (conversation_id,)
        )
        await conn.commit()
        return cur.rowcount > 0
