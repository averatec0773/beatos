"""In-app chat endpoints (read + write, persisted, non-streaming).

POST   /api/ai/chat                      — run one turn in a conversation.
POST   /api/ai/chat/confirm              — apply/skip a paused destructive write.
GET    /api/ai/chat/conversations        — list conversations.
GET    /api/ai/chat/conversations/{id}   — one conversation + messages.
DELETE /api/ai/chat/conversations/{id}   — delete a conversation.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from beatos_core.chat import service as chat_store
from beatos_http.ai import service as ai_service
from beatos_http.ai.chat_service import (
    pending_tool_uses_from,
    resume_chat_turn,
    run_chat_turn,
)

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    conversation_id: int | None = None


class ConfirmRequest(BaseModel):
    conversation_id: int
    approve: bool


def _serialize(result, conversation_id: int) -> dict:
    return {
        "conversation_id": conversation_id,
        "reply": result.reply_text,
        "tool_calls": result.tool_calls,
        "messages": result.messages,
        "pending_confirm": result.pending_confirm,
    }


async def _provider_or_409():
    provider = await ai_service.get_active_provider()
    if provider is None:
        raise HTTPException(
            status_code=409,
            detail="AI is not configured. Set it up in Settings → AI Assist.",
        )
    return provider


@router.post("/api/ai/chat")
async def chat(req: ChatRequest) -> dict:
    provider = await _provider_or_409()
    cid = req.conversation_id
    if cid is None:
        cid = await chat_store.create_conversation()
        history: list[dict] = []
    else:
        conv = await chat_store.get_conversation(cid)
        if conv is None:
            raise HTTPException(status_code=404, detail="Conversation not found.")
        history = conv["messages"]
    try:
        result = await run_chat_turn(provider, history=history, user_message=req.message)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from None
    await chat_store.replace_messages(cid, result.messages)
    return _serialize(result, cid)


@router.post("/api/ai/chat/confirm")
async def chat_confirm(req: ConfirmRequest) -> dict:
    provider = await _provider_or_409()
    conv = await chat_store.get_conversation(req.conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    messages = conv["messages"]
    tool_uses = pending_tool_uses_from(messages)
    if not tool_uses:
        raise HTTPException(status_code=409, detail="No pending action to confirm.")
    try:
        result = await resume_chat_turn(
            provider, messages=messages, tool_uses=tool_uses, approve=req.approve
        )
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from None
    await chat_store.replace_messages(req.conversation_id, result.messages)
    return _serialize(result, req.conversation_id)


@router.get("/api/ai/chat/conversations")
async def list_conversations_route() -> dict:
    return {"conversations": await chat_store.list_conversations()}


@router.get("/api/ai/chat/conversations/{conversation_id}")
async def get_conversation_route(conversation_id: int) -> dict:
    conv = await chat_store.get_conversation(conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return conv


@router.delete("/api/ai/chat/conversations/{conversation_id}")
async def delete_conversation_route(conversation_id: int) -> dict:
    return {"deleted": await chat_store.delete_conversation(conversation_id)}
