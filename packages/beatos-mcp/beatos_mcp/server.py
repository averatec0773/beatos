"""Tool registration for the BeatOS MCP server.

v0.0.20 exposes 6 read-only tools. Write tools follow in v0.0.21+ via the
2PC token skeleton already in place (see beatos_core.two_phase).
"""
from __future__ import annotations

import json

from mcp.server import Server
from mcp.types import TextContent, Tool

from beatos_mcp.db import DBNotConfigured
from beatos_mcp.log import configure as configure_logging
from beatos_mcp.tools.distinct import list_distinct_values
from beatos_mcp.tools.lists import list_lists
from beatos_mcp.tools.ping import ping
from beatos_mcp.tools.sources import list_sources
from beatos_mcp.tools.tracks import TrackNotFound, get_track, list_tracks

log = configure_logging()
server = Server("beatos-mcp")


_STRING_ARRAY = {"type": "array", "items": {"type": "string"}}

_LIST_TRACKS_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "source_id": {
            "type": "integer",
            "description": "Filter to tracks whose audio lives under this source's root_path. Mutually exclusive with list_id. Use list_sources to discover ids."
        },
        "list_id": {
            "type": "integer",
            "description": "Filter to tracks in this list. Mutually exclusive with source_id. Use list_lists to discover ids."
        },
        "producers": {**_STRING_ARRAY, "description": "Exact-match producer names. Example: ['Yung X', 'Lazy Bee']. Use list_distinct_values('producer') to discover values."},
        "genres":    {**_STRING_ARRAY, "description": "Exact-match genres. Example: ['trap', 'drill']."},
        "moods":     {**_STRING_ARRAY, "description": "Exact-match moods. Example: ['dark', 'aggressive']."},
        "keys":      {**_STRING_ARRAY, "description": "Exact-match key signatures. Example: ['Am', 'C#m']."},
        "bpm_min": {"type": "number", "description": "Inclusive lower bound on BPM. Example: 120."},
        "bpm_max": {"type": "number", "description": "Inclusive upper bound on BPM. Example: 140."},
        "has_audio": {"type": "boolean", "description": "true = only tracks with at least one audio asset attached; false = only tracks without any. Omit for no filter."},
        "sort_by": {"type": "string", "enum": ["created_at", "updated_at", "bpm", "name"], "description": "Default: created_at."},
        "sort_dir": {"type": "string", "enum": ["asc", "desc"], "description": "Default: desc."},
        "limit": {"type": "integer", "minimum": 1, "maximum": 500, "description": "Default 50, max 500. Values above are silently clamped."},
        "offset": {"type": "integer", "minimum": 0, "description": "Default 0. Use with limit to page; prefer refining filter."},
    },
}

_GET_TRACK_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["id"],
    "properties": {"id": {"type": "integer", "description": "Track id (from list_tracks items)."}},
}

_NO_ARGS = {"type": "object", "additionalProperties": False, "properties": {}}

_DISTINCT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["field"],
    "properties": {
        "field": {
            "type": "string",
            "enum": ["producer", "genre", "mood", "key"],
            "description": "Which track field to enumerate distinct values for. Returns {value, count} pairs sorted by count desc."
        },
    },
}


@server.list_tools()
async def list_tools_handler() -> list[Tool]:
    return [
        Tool(name="ping",
             description="Liveness check — returns pong and the BeatOS version.",
             inputSchema=_NO_ARGS),
        Tool(name="list_tracks",
             description="List tracks in the BeatOS library with rich filtering. Default sort: created_at desc. Default limit: 50 (max 500). Returns {items, total, returned, limit, offset, hint?}. Use list_distinct_values first to discover what values exist for producer/genre/mood/key.",
             inputSchema=_LIST_TRACKS_SCHEMA),
        Tool(name="get_track",
             description="Fetch a single track by id, including its audio/cover assets and both description fields (description = user-authored, description_draft = AI-suggested awaiting user review).",
             inputSchema=_GET_TRACK_SCHEMA),
        Tool(name="list_sources",
             description="List all sources (folders BeatOS catalogs from). Returns full list; no pagination.",
             inputSchema=_NO_ARGS),
        Tool(name="list_lists",
             description="List all user + system lists. Returns full list; no pagination.",
             inputSchema=_NO_ARGS),
        Tool(name="list_distinct_values",
             description="Enumerate distinct values + counts for one of producer/genre/mood/key. Call this before filtering list_tracks so you use the user's actual spelling.",
             inputSchema=_DISTINCT_SCHEMA),
    ]


def _text(payload) -> list[TextContent]:
    return [TextContent(type="text", text=json.dumps(payload, default=str))]


@server.call_tool()
async def call_tool_handler(name: str, arguments: dict) -> list[TextContent]:
    log.info("tool_call", tool=name, args_keys=sorted(arguments.keys()))
    try:
        if name == "ping":
            return _text(await ping())
        if name == "list_tracks":
            return _text(await list_tracks(**arguments))
        if name == "get_track":
            track_id = arguments.get("id")
            if not isinstance(track_id, int):
                raise ValueError("id must be an integer")
            try:
                return _text(await get_track(track_id))
            except TrackNotFound as e:
                raise ValueError(str(e)) from e
        if name == "list_sources":
            return _text(await list_sources())
        if name == "list_lists":
            return _text(await list_lists())
        if name == "list_distinct_values":
            field = arguments.get("field")
            if not isinstance(field, str):
                raise ValueError("field is required")
            return _text(await list_distinct_values(field))
    except DBNotConfigured as e:
        log.warning("db_not_configured", error=str(e))
        raise ValueError(str(e)) from e
    except ValueError:
        raise
    except Exception as e:  # last-resort
        log.error("tool_exception", tool=name, error=repr(e))
        raise
    raise ValueError(f"Unknown tool: {name}")
