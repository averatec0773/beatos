"""budget_history: bounds replayed context without orphaning tool_results."""
from beatos_http.ai.chat_service import (
    _MAX_HISTORY_MESSAGES,
    _MAX_TOOL_RESULT_CHARS,
    budget_history,
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
