"""In-app chat orchestration loop.

Runs Claude with the read + write tool catalog. Reads and non-destructive writes
execute inline (writes via the shared audited chokepoint submit_write, origin
"chat"). A turn that contains any DESTRUCTIVE write pauses: the loop returns
`pending_confirm` and applies nothing until `resume_chat_turn` is called with the
user's decision.
"""
from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, Field

from beatos_core.agent_permission import WritesDisabledError, submit_write
from beatos_http.ai.chat_tools import (
    anthropic_tool_defs,
    build_write_payload,
    execute_tool,
    find_tool,
    is_destructive,
)

# Safety cap on tool round-trips per user turn (a misbehaving model could loop).
_MAX_TOOL_ITERS = 8
# Origin label recorded in the Agent Actions log for chat-initiated writes.
_CLIENT = "chat"


def sanitize_history(messages: list[dict]) -> list[dict]:
    """Make a stored history safe to replay as model context: drop a trailing
    assistant turn that has unmatched tool_use blocks (a prior paused/capped turn)
    or an empty content list — both make the next provider call 400."""
    out = list(messages)
    while out:
        last = out[-1]
        if last.get("role") != "assistant":
            break
        content = last.get("content")
        has_tool_use = isinstance(content, list) and any(
            isinstance(b, dict) and b.get("type") == "tool_use" for b in content
        )
        is_empty = isinstance(content, list) and len(content) == 0
        if has_tool_use or is_empty:
            out.pop()
            continue
        break
    return out


def pending_tool_uses_from(messages: list[dict]) -> list[dict]:
    """The tool_use blocks of the trailing assistant turn (a paused destructive
    confirm), as [{id,name,input}]. Empty if the last turn has none."""
    if not messages or messages[-1].get("role") != "assistant":
        return []
    content = messages[-1].get("content")
    if not isinstance(content, list):
        return []
    return [
        {"id": b["id"], "name": b["name"], "input": b.get("input") or {}}
        for b in content
        if isinstance(b, dict) and b.get("type") == "tool_use"
    ]


class ChatResult(BaseModel):
    reply_text: str = ""
    tool_calls: list[dict] = Field(default_factory=list)
    messages: list[dict] = Field(default_factory=list)
    # When set, the loop paused for confirmation: {"tool_uses": [...], "summary": str}.
    pending_confirm: dict | None = None


def _result_text(result: Any) -> str:
    return json.dumps(result, ensure_ascii=False, default=str)


async def _run_one_tool(name: str, tool_input: dict) -> Any:
    """Execute a single tool: reads directly, writes through submit_write."""
    spec = find_tool(name)
    if spec is None:
        from beatos_http.ai.chat_tools import UnknownToolError

        raise UnknownToolError(name)
    if "handler" in spec:  # a read tool
        return await execute_tool(name, tool_input)
    payload = build_write_payload(name, tool_input)
    return await submit_write(spec["tool_name"], payload, client_name=_CLIENT)


async def _execute_tool_uses(
    tool_uses: list[dict], *, approve: bool
) -> tuple[list[dict], list[dict]]:
    """Run a turn's tool_uses. Destructive ones are skipped unless approve=True;
    non-destructive ones always run. Returns (tool_result content blocks, tool_call
    records)."""
    results: list[dict] = []
    calls: list[dict] = []
    for tu in tool_uses:
        name, tid, inp = tu["name"], tu["id"], tu.get("input") or {}
        entry: dict = {"name": name, "input": inp}
        if is_destructive(name) and not approve:
            entry["skipped"] = True
            results.append(
                {"type": "tool_result", "tool_use_id": tid,
                 "content": "User declined this action; not applied."}
            )
            calls.append(entry)
            continue
        try:
            result = await _run_one_tool(name, inp)
            entry["result"] = result
            results.append({"type": "tool_result", "tool_use_id": tid, "content": _result_text(result)})
        except WritesDisabledError as e:
            entry["error"] = str(e)
            results.append({"type": "tool_result", "tool_use_id": tid,
                            "content": f"Error: {e}", "is_error": True})
        except Exception as e:  # tool errors are fed back so the model can recover
            entry["error"] = str(e)
            results.append({"type": "tool_result", "tool_use_id": tid,
                            "content": f"Error: {e}", "is_error": True})
        calls.append(entry)
    return results, calls


def _confirm_summary(tool_uses: list[dict]) -> str:
    parts = []
    for tu in tool_uses:
        if is_destructive(tu["name"]):
            spec = find_tool(tu["name"])
            payload = spec["build"](tu.get("input") or {}) if spec else {}
            parts.append(payload.get("preview", {}).get("headline", tu["name"]))
    return "; ".join(parts) or "Confirm these changes?"


async def _run_loop(provider, messages: list[dict], tool_calls: list[dict]) -> ChatResult:
    tools = anthropic_tool_defs()
    reply_text = ""
    for _ in range(_MAX_TOOL_ITERS):
        turn = await provider.run_chat(messages=messages, tools=tools)

        assistant_content: list[dict] = []
        if turn.text:
            assistant_content.append({"type": "text", "text": turn.text})
            reply_text = turn.text
        for tu in turn.tool_uses:
            assistant_content.append({"type": "tool_use", "id": tu.id, "name": tu.name, "input": tu.input})
        messages.append({"role": "assistant", "content": assistant_content})

        if turn.stop_reason != "tool_use" or not turn.tool_uses:
            return ChatResult(reply_text=reply_text, tool_calls=tool_calls, messages=messages)

        tus = [{"id": tu.id, "name": tu.name, "input": tu.input} for tu in turn.tool_uses]
        if any(is_destructive(t["name"]) for t in tus):
            # Pause before applying anything in this turn.
            return ChatResult(
                reply_text=reply_text,
                tool_calls=tool_calls,
                messages=messages,
                pending_confirm={"tool_uses": tus, "summary": _confirm_summary(tus)},
            )

        results, calls = await _execute_tool_uses(tus, approve=True)
        tool_calls.extend(calls)
        messages.append({"role": "user", "content": results})

    return ChatResult(reply_text=reply_text, tool_calls=tool_calls, messages=messages)


async def run_chat_turn(provider, *, history: list[dict], user_message: str) -> ChatResult:
    """Drive one user turn. Pauses (pending_confirm) if a destructive write arises."""
    messages: list[dict] = sanitize_history(history) + [{"role": "user", "content": user_message}]
    return await _run_loop(provider, messages, tool_calls=[])


async def resume_chat_turn(
    provider, *, messages: list[dict], tool_uses: list[dict], approve: bool
) -> ChatResult:
    """Resume after a destructive-confirm pause: apply (or skip) the pending
    tool_uses, then continue the loop."""
    msgs = list(messages)
    results, calls = await _execute_tool_uses(tool_uses, approve=approve)
    msgs.append({"role": "user", "content": results})
    return await _run_loop(provider, msgs, tool_calls=list(calls))
