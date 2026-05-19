"""FastMCP server for BeatOS.

v0.0.23: migrated from low-level mcp.server.Server to FastMCP.
The ASGI app is mounted at /mcp by beatos-http. Stdio clients (Claude Desktop)
connect via the beatos-mcp launcher -> mcp-proxy bridge.
"""
from __future__ import annotations

import logging
from typing import Annotated, Any, Literal

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations
from pydantic import Field

from beatos_mcp.db import DBNotConfigured
from beatos_mcp.tools.await_approval import await_approval as _await_approval_impl
from beatos_mcp.tools.create_list import create_list as _create_list_impl
from beatos_mcp.tools.distinct import list_distinct_values as _list_distinct_impl
from beatos_mcp.tools.lifecycle import (
    purge_tracks as _purge_tracks_impl,
    restore_tracks as _restore_tracks_impl,
    trash_tracks as _trash_tracks_impl,
)
from beatos_mcp.tools.lists import list_lists as _list_lists_impl
from beatos_mcp.tools.ping import ping as _ping_impl
from beatos_mcp.tools.tracks import (
    TrackNotFound,
    get_track as _get_track_impl,
    list_tracks as _list_tracks_impl,
)

log = logging.getLogger(__name__)
mcp = FastMCP("beatos-mcp", streamable_http_path="/")

_READ_ANNOTATIONS = ToolAnnotations(readOnlyHint=True, idempotentHint=True)


# --- Read tools ---

@mcp.tool(annotations=_READ_ANNOTATIONS)
async def ping() -> dict:
    """Liveness check — returns pong and the BeatOS version."""
    return await _ping_impl()


@mcp.tool(annotations=_READ_ANNOTATIONS)
async def list_tracks(
    list_id: Annotated[int | None, Field(description="Filter to tracks in this list. Use list_lists to discover ids.")] = None,
    producers: Annotated[list[str] | None, Field(description="Exact-match producer names. Use list_distinct_values('producer') to discover values.")] = None,
    genres: Annotated[list[str] | None, Field(description="Exact-match genres.")] = None,
    moods: Annotated[list[str] | None, Field(description="Exact-match moods.")] = None,
    keys: Annotated[list[str] | None, Field(description="Exact-match key signatures.")] = None,
    bpm_min: Annotated[float | None, Field(description="Inclusive lower bound on BPM.")] = None,
    bpm_max: Annotated[float | None, Field(description="Inclusive upper bound on BPM.")] = None,
    has_audio: Annotated[bool | None, Field(description="true = only tracks with audio attached.")] = None,
    sort_by: Annotated[Literal["created_at", "updated_at", "bpm", "name"] | None, Field(description="Default: created_at.")] = None,
    sort_dir: Annotated[Literal["asc", "desc"] | None, Field(description="Default: desc.")] = None,
    limit: Annotated[int | None, Field(ge=1, le=500, description="Default 50, max 500.")] = None,
    offset: Annotated[int | None, Field(ge=0, description="Default 0.")] = None,
) -> dict:
    """List tracks in the BeatOS library with rich filtering. Default sort: created_at desc.
    Default limit: 50 (max 500). Returns {items, total, returned, limit, offset, hint?}.
    Use list_distinct_values first to discover what values exist for producer/genre/mood/key.
    Use get_track for full single-track detail including assets and description fields."""
    kwargs: dict[str, Any] = {}
    for k, v in {
        "list_id": list_id, "producers": producers, "genres": genres,
        "moods": moods, "keys": keys, "bpm_min": bpm_min, "bpm_max": bpm_max,
        "has_audio": has_audio, "sort_by": sort_by, "sort_dir": sort_dir,
        "limit": limit, "offset": offset,
    }.items():
        if v is not None:
            kwargs[k] = v
    return await _list_tracks_impl(**kwargs)


@mcp.tool(annotations=_READ_ANNOTATIONS)
async def get_track(
    id: Annotated[int, Field(description="Track id (from list_tracks items).")],
) -> dict:
    """Fetch a single track by id, including its audio/cover assets and both
    description fields (description = user-authored; description_draft = AI-suggested
    awaiting user review). For listing without per-track detail, use list_tracks."""
    try:
        return await _get_track_impl(id)
    except TrackNotFound as e:
        raise ValueError(str(e)) from e


@mcp.tool(annotations=_READ_ANNOTATIONS)
async def list_lists() -> dict:
    """List all user + system lists. Returns full list; no pagination."""
    return await _list_lists_impl()


@mcp.tool(annotations=_READ_ANNOTATIONS)
async def list_distinct_values(
    field: Annotated[Literal["producer", "genre", "mood", "key"], Field(description="One of: producer, genre, mood, key.")],
) -> dict:
    """Enumerate distinct values + counts for one of producer/genre/mood/key.
    Call this before filtering list_tracks so you use the user's actual spelling."""
    return await _list_distinct_impl(field)


# --- Write tools ---

@mcp.tool()
async def create_list(
    name: Annotated[str, Field(min_length=1, max_length=200, description="Display name for the new list.")],
) -> dict:
    """Request creation of a new user list. Returns a 2PC token; the actual list is
    created only after the human approves in BeatOS -> Approvals. Poll with await_approval."""
    return await _create_list_impl(name=name)


@mcp.tool(annotations=_READ_ANNOTATIONS)
async def await_approval(
    token: Annotated[str, Field(description="Token returned by any write tool.")],
) -> dict:
    """Poll the status of a 2PC token returned by any write tool.
    Returns {token, tool_name, status, ...} where status is one of
    'awaiting_approval' | 'approved' | 'rejected' | 'expired' | 'not_found'.
    On 'approved', a `result` field carries the tool-specific outcome
    (e.g. {list_id, name} for create_list, {created_ids: [...]} for create_tracks)."""
    return await _await_approval_impl(token=token)


@mcp.tool(
    annotations=ToolAnnotations(
        destructiveHint=False,  # soft delete; restore_tracks undoes it
        idempotentHint=True,
        openWorldHint=False,
    ),
)
async def trash_tracks(
    ids: Annotated[list[int], Field(min_length=1, max_length=500, description="Track ids to move to trash.")],
) -> dict:
    """Move tracks to trash (soft delete; reversible via restore_tracks).
    Returns a 2PC token. Affected tracks' titles appear in the approval card preview."""
    return await _trash_tracks_impl(ids=ids)


@mcp.tool(
    annotations=ToolAnnotations(
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    ),
)
async def restore_tracks(
    ids: Annotated[list[int], Field(min_length=1, max_length=500, description="Track ids to restore from trash.")],
) -> dict:
    """Restore previously-trashed tracks. Returns a 2PC token."""
    return await _restore_tracks_impl(ids=ids)


@mcp.tool(
    annotations=ToolAnnotations(
        destructiveHint=True,  # permanent
        idempotentHint=False,
        openWorldHint=False,
    ),
)
async def purge_tracks(
    ids: Annotated[list[int], Field(min_length=1, max_length=500, description="Track ids to PERMANENTLY DELETE.")],
) -> dict:
    """PERMANENTLY delete tracks (and cascade their asset rows). Source audio
    files on disk are not touched. The approval card requires a checkbox
    confirmation. Returns a 2PC token."""
    return await _purge_tracks_impl(ids=ids)


# --- ASGI app for FastAPI mount ---
app = mcp.streamable_http_app()
