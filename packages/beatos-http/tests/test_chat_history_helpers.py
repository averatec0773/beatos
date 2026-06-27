"""Replay-safety: drop dangling assistant turns; derive pending tool_uses."""
from beatos_http.ai.chat_service import pending_tool_uses_from, sanitize_history


def test_sanitize_drops_trailing_unmatched_tool_use():
    msgs = [
        {"role": "user", "content": "trash it"},
        {"role": "assistant", "content": [
            {"type": "text", "text": "ok"},
            {"type": "tool_use", "id": "d1", "name": "trash_tracks", "input": {"ids": [1]}},
        ]},
    ]
    out = sanitize_history(msgs)
    assert out == msgs[:1]


def test_sanitize_drops_trailing_empty_assistant():
    msgs = [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": []},
    ]
    assert sanitize_history(msgs) == msgs[:1]


def test_sanitize_keeps_clean_history():
    msgs = [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": [{"type": "text", "text": "hello"}]},
    ]
    assert sanitize_history(msgs) == msgs


def test_pending_tool_uses_from_trailing_assistant():
    msgs = [
        {"role": "user", "content": "trash it"},
        {"role": "assistant", "content": [
            {"type": "tool_use", "id": "d1", "name": "trash_tracks", "input": {"ids": [1]}},
            {"type": "tool_use", "id": "d2", "name": "trash_tracks", "input": {"ids": [2]}},
        ]},
    ]
    tus = pending_tool_uses_from(msgs)
    assert [t["id"] for t in tus] == ["d1", "d2"]
    assert tus[0]["name"] == "trash_tracks"
    assert tus[0]["input"] == {"ids": [1]}


def test_pending_tool_uses_none_when_no_trailing_tool_use():
    assert pending_tool_uses_from([{"role": "user", "content": "hi"}]) == []
