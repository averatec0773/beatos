"""POST /api/ai/chat — run one in-app chat turn (read-only MVP, non-streaming)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from beatos_http.ai import service as ai_service
from beatos_http.ai.chat_service import run_chat_turn

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = Field(default_factory=list)


@router.post("/api/ai/chat")
async def chat(req: ChatRequest) -> dict:
    provider = await ai_service.get_active_provider()
    if provider is None:
        raise HTTPException(
            status_code=409,
            detail="AI is not configured. Set it up in Settings → AI Assist.",
        )
    try:
        result = await run_chat_turn(provider, history=req.history, user_message=req.message)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from None
    return {
        "reply": result.reply_text,
        "tool_calls": result.tool_calls,
        "messages": result.messages,
    }
