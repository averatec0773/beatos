"""Client-friendly JSON-Schema flattening for MCP tool input schemas.

Why: optional tool params typed `int | None = None` (or `list[str] | None`)
generate an `anyOf` of the typed branch + a `{"type": "null"}` branch, e.g.

    "limit": {
        "anyOf": [{"type": "integer", "minimum": 1, "maximum": 500},
                  {"type": "null"}],
        "default": null, "title": "Limit", "description": "..."
    }

Anthropic-family clients strip `anyOf` before showing the schema to the model, so
the model loses the type hint and sends `limit` as the STRING "3". The sidecar's
strict jsonschema validation then (correctly) rejects "'3' is not valid under any
of the given schemas". The schema is *correct*; it's just not client-friendly.

Fix: collapse any property of the form `anyOf: [<one typed branch>, {null}]` down
to the single typed branch, merging it up so the property reads as plain
`{"type": "integer", ...}` while preserving `description` / `title` / `default`.
Idempotent and safe to run over schemas with no nullable props.
"""
from __future__ import annotations

from typing import Any

# Keys that live on the *property* wrapper (alongside anyOf) and must survive the
# flatten — they describe the field to the model, not the type.
_PRESERVE_KEYS = ("description", "title", "default")


def _is_null_branch(branch: Any) -> bool:
    return isinstance(branch, dict) and branch.get("type") == "null"


def flatten_nullable_property(prop: dict[str, Any]) -> dict[str, Any]:
    """Flatten a single property dict in place. If `prop` is
    `{"anyOf": [<typed>, {"type": "null"}], ...}` with exactly one non-null
    branch, replace it with that branch merged with the preserved wrapper keys.
    Otherwise return `prop` unchanged. Returns the (possibly same) dict."""
    any_of = prop.get("anyOf")
    if not isinstance(any_of, list):
        return prop
    non_null = [b for b in any_of if not _is_null_branch(b)]
    has_null = any(_is_null_branch(b) for b in any_of)
    # Only flatten the unambiguous T-or-null shape; leave true unions intact.
    if not has_null or len(non_null) != 1 or not isinstance(non_null[0], dict):
        return prop
    typed = dict(non_null[0])
    # Wrapper-level keys win for the human-facing annotations; the typed branch
    # supplies type/constraints. (A `default` on the wrapper is the param default.)
    for k in _PRESERVE_KEYS:
        if k in prop:
            typed[k] = prop[k]
    prop.clear()
    prop.update(typed)
    return prop


def flatten_nullable_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """Flatten every `anyOf: [T, null]` property of an object schema in place.
    Returns the same schema dict. No-op for schemas without such properties."""
    props = schema.get("properties")
    if not isinstance(props, dict):
        return schema
    for prop in props.values():
        if isinstance(prop, dict):
            flatten_nullable_property(prop)
    return schema
