"""QA P0-2: optional params must emit a flattened, client-friendly schema.

Anthropic clients strip `anyOf`, so a param typed `int | None = None` (which
pydantic renders as `anyOf: [{integer}, {null}]`) loses its type and the model
sends a string. flatten_nullable_schema collapses `anyOf: [T, null]` -> T.
"""
from __future__ import annotations

from beatos_mcp.schema_compat import (
    flatten_nullable_property,
    flatten_nullable_schema,
)


def test_flatten_collapses_typed_or_null():
    prop = {
        "anyOf": [
            {"type": "integer", "minimum": 1, "maximum": 500},
            {"type": "null"},
        ],
        "default": None,
        "title": "Limit",
        "description": "Default 50, max 500.",
    }
    flatten_nullable_property(prop)
    assert prop["type"] == "integer"
    assert prop["minimum"] == 1
    assert prop["maximum"] == 500
    assert "anyOf" not in prop
    # human-facing annotations preserved
    assert prop["description"] == "Default 50, max 500."
    assert prop["title"] == "Limit"
    assert prop["default"] is None


def test_flatten_handles_array_typed_or_null():
    prop = {
        "anyOf": [
            {"type": "array", "items": {"type": "string"}},
            {"type": "null"},
        ],
        "default": None,
        "description": "Exact-match producer names.",
    }
    flatten_nullable_property(prop)
    assert prop["type"] == "array"
    assert prop["items"] == {"type": "string"}
    assert "anyOf" not in prop
    assert prop["description"] == "Exact-match producer names."


def test_flatten_leaves_plain_property_untouched():
    prop = {"type": "integer", "description": "Track id."}
    before = dict(prop)
    flatten_nullable_property(prop)
    assert prop == before


def test_flatten_leaves_true_union_intact():
    # A genuine 2-non-null union must NOT be collapsed (would lose a branch).
    prop = {"anyOf": [{"type": "integer"}, {"type": "string"}]}
    before = dict(prop)
    flatten_nullable_property(prop)
    assert prop == before


def test_flatten_leaves_union_with_null_and_two_types_intact():
    prop = {"anyOf": [{"type": "integer"}, {"type": "string"}, {"type": "null"}]}
    before = dict(prop)
    flatten_nullable_property(prop)
    assert prop == before


def test_flatten_is_idempotent():
    prop = {"anyOf": [{"type": "integer"}, {"type": "null"}], "default": None}
    flatten_nullable_property(prop)
    once = dict(prop)
    flatten_nullable_property(prop)
    assert prop == once


def test_flatten_schema_walks_all_properties():
    schema = {
        "type": "object",
        "properties": {
            "limit": {
                "anyOf": [{"type": "integer"}, {"type": "null"}],
                "default": None,
            },
            "id": {"type": "integer"},
            "names": {
                "anyOf": [
                    {"type": "array", "items": {"type": "string"}},
                    {"type": "null"},
                ],
                "default": None,
            },
        },
    }
    flatten_nullable_schema(schema)
    assert schema["properties"]["limit"]["type"] == "integer"
    assert schema["properties"]["names"]["type"] == "array"
    assert schema["properties"]["id"]["type"] == "integer"
    for p in schema["properties"].values():
        assert "anyOf" not in p


def test_flatten_schema_no_properties_is_noop():
    schema = {"type": "object"}
    assert flatten_nullable_schema(schema) == {"type": "object"}


async def test_no_registered_tool_has_anyof_null_after_flatten():
    """End-to-end: every tool the server exposes must already be flattened —
    no property may carry a top-level anyOf with a null branch."""
    from beatos_mcp.server import mcp

    tools = await mcp.list_tools()
    offenders: list[str] = []
    for t in tools:
        for pname, p in (t.inputSchema.get("properties") or {}).items():
            any_of = p.get("anyOf") if isinstance(p, dict) else None
            if isinstance(any_of, list) and any(
                isinstance(b, dict) and b.get("type") == "null" for b in any_of
            ):
                offenders.append(f"{t.name}.{pname}")
    assert not offenders, f"unflattened nullable props: {offenders}"


async def test_list_tracks_limit_is_plain_integer():
    from beatos_mcp.server import mcp

    tools = await mcp.list_tools()
    lt = next(t for t in tools if t.name == "list_tracks")
    limit = lt.inputSchema["properties"]["limit"]
    assert limit.get("type") == "integer"
    assert "anyOf" not in limit
