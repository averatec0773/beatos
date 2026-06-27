"""In-app chat orchestration loop (read-only MVP).

Runs Claude with the read tool catalog: call the provider, execute any tool_use,
feed the results back, repeat until the model stops asking for tools (or a safety
cap is hit). Returns the final assistant text, the tool activity (for display +
persistence), and the full updated message history.
"""
from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, Field

from beatos_http.ai.chat_tools import anthropic_tool_defs, execute_tool

# Safety cap on tool round-trips per user turn (a misbehaving model could loop).
_MAX_TOOL_ITERS = 8


class ChatResult(BaseModel):
    reply_text: str = ""
    tool_calls: list[dict] = Field(default_factory=list)
    messages: list[dict] = Field(default_factory=list)


def _result_text(result: Any) -> str:
    return json.dumps(result, ensure_ascii=False, default=str)


async def run_chat_turn(provider, *, history: list[dict], user_message: str) -> ChatResult:
    """Drive one user turn to completion. `provider` needs an async
    `run_chat(messages, tools) -> ChatTurn`. `history` is prior Anthropic
    messages (may be empty)."""
    messages: list[dict] = list(history) + [{"role": "user", "content": user_message}]
    tools = anthropic_tool_defs()
    tool_calls: list[dict] = []
    reply_text = ""

    for _ in range(_MAX_TOOL_ITERS):
        turn = await provider.run_chat(messages=messages, tools=tools)

        assistant_content: list[dict] = []
        if turn.text:
            assistant_content.append({"type": "text", "text": turn.text})
            reply_text = turn.text
        for tu in turn.tool_uses:
            assistant_content.append(
                {"type": "tool_use", "id": tu.id, "name": tu.name, "input": tu.input}
            )
        messages.append({"role": "assistant", "content": assistant_content})

        if turn.stop_reason != "tool_use" or not turn.tool_uses:
            break

        results_content: list[dict] = []
        for tu in turn.tool_uses:
            entry: dict = {"name": tu.name, "input": tu.input}
            try:
                result = await execute_tool(tu.name, tu.input)
                entry["result"] = result
                results_content.append(
                    {"type": "tool_result", "tool_use_id": tu.id, "content": _result_text(result)}
                )
            except Exception as e:  # tool errors are fed back so the model can recover
                entry["error"] = str(e)
                results_content.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": tu.id,
                        "content": f"Error: {e}",
                        "is_error": True,
                    }
                )
            tool_calls.append(entry)
        messages.append({"role": "user", "content": results_content})

    return ChatResult(reply_text=reply_text, tool_calls=tool_calls, messages=messages)
