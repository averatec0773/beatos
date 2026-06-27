"""In-app chat endpoints (read + write, non-streaming).

POST /api/ai/chat          — run one turn; may return pending_confirm.
POST /api/ai/chat/confirm  — apply (or skip) a paused destructive write, continue.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from beatos_http.ai import service as ai_service
from beatos_http.ai.chat_service import resume_chat_turn, run_chat_turn

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = Field(default_factory=list)


class ConfirmRequest(BaseModel):
    messages: list[dict]
    tool_uses: list[dict]
    approve: bool


def _serialize(result) -> dict:
    return {
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
    try:
        result = await run_chat_turn(provider, history=req.history, user_message=req.message)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from None
    return _serialize(result)


@router.post("/api/ai/chat/confirm")
async def chat_confirm(req: ConfirmRequest) -> dict:
    provider = await _provider_or_409()
    try:
        result = await resume_chat_turn(
            provider, messages=req.messages, tool_uses=req.tool_uses, approve=req.approve
        )
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from None
    return _serialize(result)
