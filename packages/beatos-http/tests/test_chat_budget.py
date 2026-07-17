"""budget_history: bounds replayed context without orphaning tool_results."""
from beatos_http.ai.chat_service import (
    _MAX_HISTORY_MESSAGES,
    _MAX_TOOL_RESULT_CHARS,
    budget_history,
    sanitize_history,
)


def test_truncates_large_tool_result_content():
    big = "x" * (_MAX_TOOL_RESULT_CHARS + 500)
    msgs = [
        {"role": "user", "content": "hi"},
        {
            "role": "user",
            "content": [{"type": "tool_result", "tool_use_id": "t1", "content": big}],
        },
    ]
    out = budget_history(msgs)
    tr = out[1]["content"][0]["content"]
    assert len(tr) < len(big)
    assert "truncated" in tr
    # short content is left untouched
    assert budget_history([{"role": "user", "content": "hi"}])[0]["content"] == "hi"


def test_small_tool_result_untouched():
    msgs = [
        {"role": "assistant", "content": [{"type": "tool_use", "id": "t1", "name": "x", "input": {}}]},
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "t1", "content": "[]"}]},
    ]
    assert budget_history(msgs) == msgs


def test_caps_message_count_without_orphaning_tool_result():
    # Build a long history; the natural cut point lands on a tool_result turn.
    msgs = [{"role": "user", "content": f"m{i}"} for i in range(_MAX_HISTORY_MESSAGES + 5)]
    # Force the message at the cut boundary to be a tool_result-bearing user turn.
    cut = len(msgs) - _MAX_HISTORY_MESSAGES
    msgs[cut] = {
        "role": "user",
        "content": [{"type": "tool_result", "tool_use_id": "z", "content": "x"}],
    }
    out = budget_history(msgs)
    assert len(out) <= _MAX_HISTORY_MESSAGES
    # window must NOT begin on a tool_result turn (would orphan the tool_use)
    first = out[0]["content"]
    is_tool_result = isinstance(first, list) and any(
        b.get("type") == "tool_result" for b in first
    )
    assert not is_tool_result


def test_short_history_passes_through():
    msgs = [{"role": "user", "content": "a"}, {"role": "assistant", "content": [{"type": "text", "text": "b"}]}]
    assert budget_history(msgs) == msgs


def test_window_never_opens_on_assistant_turn():
    # The cut landing on an assistant turn must advance to the next plain user
    # turn — Anthropic 400s when messages[0].role != "user", which wedged long
    # conversations at 502 on every subsequent turn.
    msgs = [{"role": "user", "content": f"m{i}"} for i in range(_MAX_HISTORY_MESSAGES + 5)]
    cut = len(msgs) - _MAX_HISTORY_MESSAGES
    msgs[cut] = {"role": "assistant", "content": [{"type": "text", "text": "a"}]}
    out = budget_history(msgs)
    assert out, "window must not be emptied"
    assert out[0]["role"] == "user"
    assert not isinstance(out[0]["content"], list)


def test_sanitize_repairs_history_opening_on_assistant_turn():
    # Pre-fix budget truncation could PERSIST a history that opens on an
    # assistant turn; sanitize_history must repair it on replay.
    msgs = [
        {"role": "assistant", "content": [{"type": "text", "text": "legacy cut"}]},
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": [{"type": "text", "text": "reply"}]},
    ]
    out = sanitize_history(msgs)
    assert out[0]["role"] == "user"
    assert len(out) == 2
