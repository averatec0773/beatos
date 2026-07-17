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

# Context-window budget. The full conversation is replayed to the model each turn,
# and tool_result blocks (catalog JSON) are the dominant token sink, so left
# unbounded a long thread balloons cost and eventually overflows the model's
# context (hard 400). We (1) shrink stale tool_result payloads — the model rarely
# needs the full prior listing verbatim and can re-query — and (2) cap the number
# of replayed messages, dropping from the front without orphaning a tool_result
# (every tool_result must follow its tool_use, or the provider 400s).
_MAX_TOOL_RESULT_CHARS = 2000
_MAX_HISTORY_MESSAGES = 40


def _has_tool_result(content: object) -> bool:
    return isinstance(content, list) and any(
        isinstance(b, dict) and b.get("type") == "tool_result" for b in content
    )


def budget_history(messages: list[dict]) -> list[dict]:
    """Bound the replayed history so cross-turn token growth stays in check."""
    out: list[dict] = []
    for m in messages:
        content = m.get("content")
        if isinstance(content, list):
            blocks = []
            for b in content:
                if (
                    isinstance(b, dict)
                    and b.get("type") == "tool_result"
                    and isinstance(b.get("content"), str)
                    and len(b["content"]) > _MAX_TOOL_RESULT_CHARS
                ):
                    raw = b["content"]
                    b = {
                        **b,
                        "content": raw[:_MAX_TOOL_RESULT_CHARS]
                        + f"\n…[truncated {len(raw) - _MAX_TOOL_RESULT_CHARS} chars]",
                    }
                blocks.append(b)
            out.append({**m, "content": blocks})
        else:
            out.append(m)

    if len(out) > _MAX_HISTORY_MESSAGES:
        start = len(out) - _MAX_HISTORY_MESSAGES
        # The kept window must open on a PLAIN user turn: a leading tool_result
        # turn would reference a dropped tool_use, and a leading assistant turn
        # 400s on Anthropic (first message role must be "user") — which would
        # wedge every subsequent turn of a long conversation at 502.
        while start < len(out) and (
            out[start].get("role") != "user" or _has_tool_result(out[start].get("content"))
        ):
            start += 1
        out = out[start:]
    return out


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
    # Also repair the FRONT: a stored history that opens on an assistant turn
    # (persisted by the pre-fix budget truncation) or on a tool_result turn
    # 400s on Anthropic — drop leading turns until a plain user turn.
    start = 0
    while start < len(out) and (
        out[start].get("role") != "user" or _has_tool_result(out[start].get("content"))
    ):
        start += 1
    return out[start:] if start else out


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
            # A builder crash on malformed model input must not 500 the turn —
            # this runs BEFORE the confirm round-trip, so the tool name is an
            # acceptable degraded summary.
            try:
                payload = spec["build"](tu.get("input") or {}) if spec else {}
            except Exception:
                payload = {}
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
    messages: list[dict] = budget_history(sanitize_history(history)) + [
        {"role": "user", "content": user_message}
    ]
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
