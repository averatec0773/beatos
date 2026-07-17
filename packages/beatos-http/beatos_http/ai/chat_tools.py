"""Read tool catalog for the in-app AI chat.

Each entry exposes a beatos-core read function to Claude as a tool. Reads run
directly — no consent gate (writes, added in a later phase, route through the
core chokepoint). The catalog is a list so adding a tool is one entry.
"""
from __future__ import annotations

from typing import Any

from beatos_core.tracks.service import (
    get_track,
    list_distinct_values,
    list_tracks,
)

# Local-only fields never sent to the cloud model. `project_path` is an absolute
# path on the user's machine (Track marks it "Local-only"); keep the chat surface
# as privacy-scoped as the suggest-tags path, which sends only cover + title.
_TRACK_EXCLUDE = {"project_path"}


def _serialize_track(t: Any) -> dict:
    return t.model_dump(mode="json", exclude=_TRACK_EXCLUDE)


async def _search_tracks(inp: dict) -> Any:
    tracks = await list_tracks(
        q=inp.get("q"),
        genres=inp.get("genres"),
        moods=inp.get("moods"),
        producers=inp.get("producers"),
        bpm_min=inp.get("bpm_min"),
        bpm_max=inp.get("bpm_max"),
        has_audio=inp.get("has_audio"),
    )
    return [_serialize_track(t) for t in tracks]


async def _get_track(inp: dict) -> Any:
    t = await get_track(int(inp["track_id"]))
    return _serialize_track(t) if t else None


async def _list_distinct_values(inp: dict) -> Any:
    return await list_distinct_values(inp["field"])


READ_TOOLS: list[dict] = [
    {
        "name": "search_tracks",
        "description": (
            "Search the producer's beat catalog. Free-text 'q' matches title / "
            "producer / tags; optional filters: genres, moods, producers (string "
            "arrays), bpm_min, bpm_max (integers), has_audio (boolean). Omit all "
            "args to list everything. Returns the matching tracks."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "q": {"type": "string"},
                "genres": {"type": "array", "items": {"type": "string"}},
                "moods": {"type": "array", "items": {"type": "string"}},
                "producers": {"type": "array", "items": {"type": "string"}},
                "bpm_min": {"type": "integer"},
                "bpm_max": {"type": "integer"},
                "has_audio": {"type": "boolean"},
            },
        },
        "handler": _search_tracks,
    },
    {
        "name": "get_track",
        "description": "Get one track's full metadata by its numeric id.",
        "input_schema": {
            "type": "object",
            "properties": {"track_id": {"type": "integer"}},
            "required": ["track_id"],
        },
        "handler": _get_track,
    },
    {
        "name": "list_distinct_values",
        "description": (
            "List the distinct values present in the catalog for one metadata "
            "field (e.g. genre, mood, producer). Useful before filtering."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"field": {"type": "string"}},
            "required": ["field"],
        },
        "handler": _list_distinct_values,
    },
]


def _preview_update_tracks(inp: dict) -> str:
    fields = ", ".join((inp.get("patch") or {}).keys()) or "fields"
    return f"Update {len(inp.get('ids') or [])} track(s): {fields}"


def _build_update_tracks(inp: dict) -> dict:
    # Tolerate missing keys: providers fall back to input={} when the model
    # emits unparseable tool JSON, and this builder also runs on the
    # pre-confirm summary path where a KeyError would 500 the whole turn.
    return {
        "ids": inp.get("ids") or [],
        "patch": inp.get("patch") or {},
        "preview": {"headline": _preview_update_tracks(inp)},
    }


def _preview_trash_tracks(inp: dict) -> str:
    return f"Move {len(inp.get('ids') or [])} track(s) to Trash"


def _build_trash_tracks(inp: dict) -> dict:
    return {"ids": inp.get("ids") or [], "preview": {"headline": _preview_trash_tracks(inp)}}


# Write tools. `tool_name` is the apply-handler name (beatos_core.approvals). They
# run through submit_write (mode-gated + audited). `destructive=True` makes the
# loop pause for an explicit in-chat confirm before applying.
WRITE_TOOLS: list[dict] = [
    {
        "name": "update_tracks",
        "tool_name": "update_tracks",
        "destructive": False,
        "description": (
            "Update metadata on one or more tracks. 'ids' is a list of track ids. "
            "'patch' maps fields to new values: scalar fields title, bpm, key, "
            "description, is_free take a plain value; multi-value fields producer, "
            "genre, mood take either a list (replace) or {\"add\": [...], "
            "\"remove\": [...]}. Only include fields you intend to change."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "ids": {"type": "array", "items": {"type": "integer"}},
                "patch": {"type": "object"},
            },
            "required": ["ids", "patch"],
        },
        "build": _build_update_tracks,
    },
    {
        "name": "trash_tracks",
        "tool_name": "trash_tracks",
        "destructive": True,
        "description": (
            "Move one or more tracks to Trash (reversible). 'ids' is a list of "
            "track ids. This is a destructive action and will ask the user to "
            "confirm before applying."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"ids": {"type": "array", "items": {"type": "integer"}}},
            "required": ["ids"],
        },
        "build": _build_trash_tracks,
    },
]


class UnknownToolError(KeyError):
    """No chat tool is registered under that name."""


def _read_spec(name: str) -> dict | None:
    return next((t for t in READ_TOOLS if t["name"] == name), None)


def _write_spec(name: str) -> dict | None:
    return next((t for t in WRITE_TOOLS if t["name"] == name), None)


def find_tool(name: str) -> dict | None:
    return _read_spec(name) or _write_spec(name)


def is_destructive(name: str) -> bool:
    spec = _write_spec(name)
    return bool(spec and spec["destructive"])


def anthropic_tool_defs() -> list[dict]:
    """The Anthropic `tools` array (name/description/input_schema only)."""
    return [
        {"name": t["name"], "description": t["description"], "input_schema": t["input_schema"]}
        for t in (*READ_TOOLS, *WRITE_TOOLS)
    ]


def build_write_payload(name: str, tool_input: dict | None) -> dict:
    """Build the submit_write payload (incl. preview) for a write tool."""
    spec = _write_spec(name)
    if spec is None:
        raise UnknownToolError(name)
    return spec["build"](tool_input or {})


async def execute_tool(name: str, tool_input: dict | None) -> Any:
    """Run a READ tool by name; return a JSON-serialisable result. Writes do NOT
    go through here — they route through submit_write in the chat loop."""
    spec = _read_spec(name)
    if spec is None:
        raise UnknownToolError(name)
    return await spec["handler"](tool_input or {})
