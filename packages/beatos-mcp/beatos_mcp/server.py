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

from beatos_mcp.policy import submit_write
from beatos_mcp.preview import build_preview
from beatos_mcp.pro import pro_available
from beatos_mcp.tools.await_approval import await_approval as _await_approval_impl
from beatos_mcp.tools.create_list import create_list as _create_list_impl
from beatos_mcp.tools.ingest import (
    attach_assets as _attach_assets_impl,
    create_tracks as _create_tracks_impl,
    detach_assets as _detach_assets_impl,
)
from beatos_mcp.tools.list_curation import (
    add_tracks_to_list as _add_tracks_impl,
    delete_list as _delete_list_impl,
    remove_tracks_from_list as _remove_tracks_impl,
    reorder_list as _reorder_list_impl,
    update_list as _update_list_impl,
)
from beatos_mcp.tools.distinct import list_distinct_values as _list_distinct_impl
from beatos_mcp.tools.export import export_metadata as _export_metadata_impl
from beatos_mcp.tools.export import list_export_platforms as _list_export_platforms_impl
from beatos_mcp.tools.search import search_tracks as _search_tracks_impl
from beatos_mcp.tools.licenses import set_license_tiers as _set_license_tiers_impl
from beatos_mcp.tools.lifecycle import (
    purge_tracks as _purge_tracks_impl,
    restore_tracks as _restore_tracks_impl,
    trash_tracks as _trash_tracks_impl,
)
from beatos_mcp.tools.metadata import (
    merge_metadata as _merge_metadata_impl,
    update_tracks as _update_tracks_impl,
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
    """Fetch a single track by id, including its audio/cover assets. For listing
    without per-track detail, use list_tracks."""
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


@mcp.tool(annotations=_READ_ANNOTATIONS)
async def search_tracks(
    query: Annotated[str, Field(description="Search string. Supports field tokens (genre:, mood:, producer:, key:, tag:), bpm:>140 / bpm:140-160, has:audio, quoted \"two words\", and bare words matched across title/description/producer/genre/mood/key.")],
    limit: Annotated[int | None, Field(ge=1, le=500, description="Default 50, max 500.")] = None,
    offset: Annotated[int | None, Field(ge=0, description="Default 0. Page through results larger than `limit` (mirrors list_tracks).")] = None,
) -> dict:
    """Search tracks with the same query syntax humans use in the BeatOS search box.
    Returns identical results to the in-app search. Returns {items, total, returned, limit, offset, hint?}.
    Use offset to page when total exceeds the returned count."""
    return await _search_tracks_impl(
        query=query,
        limit=limit if limit is not None else 50,
        offset=offset if offset is not None else 0,
    )


@mcp.tool(annotations=_READ_ANNOTATIONS)
async def list_export_platforms() -> dict:
    """List platforms BeatOS can export metadata for (e.g. "netease")."""
    return await _list_export_platforms_impl()


@mcp.tool(annotations=_READ_ANNOTATIONS)
async def export_metadata(
    track_id: Annotated[int, Field(description="Track id to export. Use list_tracks/get_track to discover ids.")],
    platform: Annotated[str, Field(description="Platform key from list_export_platforms (e.g. 'netease').")],
) -> dict:
    """Export one track's metadata shaped for a platform's upload form.

    Returns {platform, fields:[{key,label,value,options,note}]}. Genre/mood are
    translated to the platform's vocabulary; multi-genre returns `options` (the
    platform is single-select). Identical output to the in-app export panel.
    """
    return await _export_metadata_impl(track_id, platform)


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


@mcp.tool()
async def update_list(
    list_id: Annotated[int, Field(description="Target user list id.")],
    name: Annotated[str, Field(min_length=1, max_length=200, description="New name.")],
) -> dict:
    """Rename a user list (system lists are immutable). Returns a 2PC token."""
    return await _update_list_impl(list_id=list_id, name=name)


@mcp.tool(annotations=ToolAnnotations(destructiveHint=True, idempotentHint=False, openWorldHint=False))
async def delete_list(
    list_id: Annotated[int, Field(description="User list id to delete.")],
) -> dict:
    """PERMANENTLY delete a user list. Member tracks are unaffected. System
    lists are immutable. Returns a 2PC token; checkbox-gated in the approval card."""
    return await _delete_list_impl(list_id=list_id)


@mcp.tool(annotations=ToolAnnotations(destructiveHint=False, idempotentHint=True, openWorldHint=False))
async def add_tracks_to_list(
    list_id: Annotated[int, Field(description="Target list id.")],
    track_ids: Annotated[list[int], Field(min_length=1, max_length=500, description="Track ids to append.")],
) -> dict:
    """Append tracks to the end of a list. Already-present tracks are skipped (idempotent)."""
    return await _add_tracks_impl(list_id=list_id, track_ids=track_ids)


@mcp.tool(annotations=ToolAnnotations(destructiveHint=False, idempotentHint=True, openWorldHint=False))
async def remove_tracks_from_list(
    list_id: Annotated[int, Field(description="Target list id.")],
    track_ids: Annotated[list[int], Field(min_length=1, max_length=500, description="Track ids to remove from the list.")],
) -> dict:
    """Remove tracks from a list. Not-in-list ids are skipped (idempotent)."""
    return await _remove_tracks_impl(list_id=list_id, track_ids=track_ids)


@mcp.tool(annotations=ToolAnnotations(destructiveHint=False, idempotentHint=False, openWorldHint=False))
async def reorder_list(
    list_id: Annotated[int, Field(description="Target list id.")],
    track_ids: Annotated[list[int], Field(min_length=1, max_length=500, description="Full membership in the desired order. Must match current list contents exactly.")],
) -> dict:
    """Reorder a list. track_ids must be the full current membership in the
    desired order (set equality required). Token-create rejects mismatches."""
    return await _reorder_list_impl(list_id=list_id, track_ids=track_ids)


@mcp.tool(annotations=ToolAnnotations(destructiveHint=False, idempotentHint=True, openWorldHint=False))
async def update_tracks(
    ids: Annotated[list[int], Field(min_length=1, max_length=500, description="Target track ids.")],
    patch: Annotated[
        dict,
        Field(
            description=(
                "Partial-update spec. Scalar fields: title, bpm, key, description (set or null-clear). "
                "Multi-value fields producer/genre/mood accept either a list (replace) or "
                "{add?: [...], remove?: [...]} (per-row delta). At least one field required."
            ),
        ),
    ],
) -> dict:
    """Bulk-update tracks. Returns a 2PC token."""
    return await _update_tracks_impl(ids=ids, patch=patch)


@mcp.tool(annotations=ToolAnnotations(destructiveHint=True, idempotentHint=True, openWorldHint=False))
async def set_license_tiers(
    track_id: Annotated[int, Field(gt=0, description="Target track id.")],
    tiers: Annotated[
        list[dict],
        Field(
            max_length=20,
            description=(
                "Full replacement list of license tiers. Each item: "
                "{name?: str (0-200 chars; blank = renderer derives a label "
                "from deliverables), deliverables?: list[str] (recommended "
                "one token per tier: 'mp3','wav','stem'; any string accepted "
                "for adapter-specific tokens), "
                "prices?: object mapping currency code → amount (e.g. "
                "{\"CNY\": 300, \"USD\": 50}; supported codes: CNY, USD, EUR, "
                "JPY, GBP; any string accepted but the renderer only displays "
                "the five supported codes; empty {} = tier exists but is "
                "unpriced), notes?: str <=2000 chars}. Passing an empty list "
                "clears all tiers. Existing tiers are replaced wholesale."
            ),
        ),
    ],
) -> dict:
    """Replace the full license-tier list on a track. Returns a 2PC token."""
    return await _set_license_tiers_impl(track_id=track_id, tiers=tiers)


@mcp.tool(annotations=ToolAnnotations(destructiveHint=False, idempotentHint=True, openWorldHint=False))
async def merge_metadata(
    field: Annotated[Literal["producer", "genre", "mood"], Field(description="Multi-value field to collapse.")],
    from_: Annotated[
        list[str],
        Field(min_length=1, max_length=20, alias="from", description="Aliases to collapse into `to`."),
    ],
    to: Annotated[str, Field(min_length=1, max_length=200, description="Canonical replacement value.")],
) -> dict:
    """Library-wide rename. Any track whose `field` array contains any of `from`
    has those entries replaced with `to` (deduped). Returns a 2PC token."""
    return await _merge_metadata_impl(field=field, from_=from_, to=to)


@mcp.tool(annotations=ToolAnnotations(destructiveHint=False, idempotentHint=False, openWorldHint=False))
async def create_tracks(
    items: Annotated[
        list[dict],
        Field(
            min_length=1,
            max_length=100,
            description=(
                "Each item: {title (required, 1-200 chars), bpm?, key?, "
                "producer?: list[str], genre?: list[str], mood?: list[str]}."
            ),
        ),
    ],
) -> dict:
    """Batch-create empty track rows (no assets attached). Returns a 2PC token."""
    return await _create_tracks_impl(items=items)


@mcp.tool(annotations=ToolAnnotations(destructiveHint=False, idempotentHint=False, openWorldHint=True))
async def attach_assets(
    items: Annotated[
        list[dict],
        Field(
            min_length=1,
            max_length=500,
            description=(
                "Each item: {track_id (int), role ('audio'|'cover'), "
                "path (absolute filesystem path)}. "
                "Audio: .mp3/.wav/.flac/.aif/.aiff. Cover: .jpg/.jpeg/.png/.webp. "
                "Files must exist; existing role-slots are replaced in place. "
                "Duplicate (track_id, role) pairs within the batch are rejected."
            ),
        ),
    ],
) -> dict:
    """Batch-attach assets to existing tracks. One 2PC token for the whole batch.
    Files are referenced by absolute path (BeatOS does not copy them). Designed
    for folder-import workflows: pair with create_tracks to onboard a folder
    of beats in two approval clicks."""
    return await _attach_assets_impl(items=items)


@mcp.tool(annotations=ToolAnnotations(destructiveHint=False, idempotentHint=True, openWorldHint=False))
async def detach_assets(
    items: Annotated[
        list[dict],
        Field(
            min_length=1,
            max_length=500,
            description=(
                "Each item: {track_id (int), role ('audio'|'cover')}. "
                "Idempotent: items whose asset is already absent are reported "
                "with removed=false but do not fail the batch."
            ),
        ),
    ],
) -> dict:
    """Batch-detach assets from tracks. Removes the asset row(s); the source
    audio file on disk is not touched. Returns a 2PC token."""
    return await _detach_assets_impl(items=items)


# --- Pro tools (registered only when the beatos-publish engine is present) ---

if pro_available():

    @mcp.tool(annotations=_READ_ANNOTATIONS)
    async def list_publish_platforms() -> dict:
        """List platforms BeatOS can PUBLISH to (e.g. 'netease', 'douyin').

        Distinct from list_export_platforms (which lists metadata-export targets):
        call this before publish_track so you use a valid platform key."""
        from beatos_publish.platforms import available
        return {"platforms": available()}

    @mcp.tool(annotations=_READ_ANNOTATIONS)
    async def publish_session_status(
        platform: Annotated[str | None, Field(description="Platform key to check; omit to check all publishable platforms.")] = None,
    ) -> dict:
        """Check login/session state per platform before publishing. Returns
        {sessions: {platform: 'valid'|'expired'|'not_logged_in'}}. A valid session
        is the #1 precondition for publish_track. NOTE: this launches a headless
        browser per platform (seconds + cost) — call it deliberately, not in a loop."""
        from beatos_publish.platforms import available
        from beatos_publish.service import validate_session
        platforms = [platform] if platform else available()
        return {"sessions": {p: await validate_session(p) for p in platforms}}

    @mcp.tool(annotations=_READ_ANNOTATIONS)
    async def list_publish_jobs() -> dict:
        """List all publish jobs known this session, for recovery after losing a
        job_id. Returns {jobs: [{job_id, track_id, platform, stage, message,
        result?}, ...]}. (Status is in-memory; a sidecar restart may clear it.)"""
        from beatos_publish.jobs import REGISTRY
        return {"jobs": [j.model_dump(mode="json") for j in REGISTRY.all()]}

    @mcp.tool(
        annotations=ToolAnnotations(destructiveHint=False, idempotentHint=False, openWorldHint=True),
    )
    async def publish_track(
        track_id: Annotated[int, Field(description="Track id to publish.")],
        platform: Annotated[str, Field(description="Platform key from list_publish_platforms (e.g. 'netease', 'douyin').")],
        audio_asset_id: Annotated[int | None, Field(description="Audio asset id (untagged) — required for music platforms like netease.")] = None,
        video_asset_id: Annotated[int | None, Field(description="Promo-video asset id — required for video platforms like douyin.")] = None,
        cover_asset_id: Annotated[int | None, Field(description="Cover image asset id, optional.")] = None,
        deliverable_wav_asset_id: Annotated[int | None, Field(description="Buyer-deliverable lossless WAV asset id (netease 授权设置).")] = None,
        deliverable_stems_asset_id: Annotated[int | None, Field(description="Buyer-deliverable stems-zip asset id (netease 授权设置).")] = None,
        dry_run: Annotated[bool, Field(description="Fill the form but do NOT submit — a safe rehearsal.")] = False,
        account: Annotated[str, Field(description="Session account; default 'default'.")] = "default",
    ) -> dict:
        """START publishing a track to a platform (Pro). Subject to the agent
        permission policy: under 'confirm' (default) this returns a 2PC token to
        approve in BeatOS → Agent Actions (the browser opens only after approval);
        under 'auto_approve' it starts immediately and returns a job_id.

        This does NOT complete the publish: it opens a (visible) browser, fills the
        form and uploads files (slow), then PAUSES for a human at the platform's gate
        (netease: SMS code; douyin: review + click 发布). After approval, poll
        publish_status(job_id). Requires a prior login (check publish_session_status)
        and a desktop session with a display. Do NOT retry on timeout — check status.
        Use dry_run=true to rehearse without submitting."""
        from beatos_publish.platforms import available
        if platform not in available():
            raise ValueError(
                f"unknown platform {platform!r}; call list_publish_platforms() for valid keys"
            )
        payload = {
            "request": {
                "track_id": track_id,
                "platform": platform,
                "account": account,
                "audio_asset_id": audio_asset_id,
                "video_asset_id": video_asset_id,
                "cover_asset_id": cover_asset_id,
                "deliverable_wav_asset_id": deliverable_wav_asset_id,
                "deliverable_stems_asset_id": deliverable_stems_asset_id,
                "dry_run": dry_run,
            },
            "preview": build_preview(
                headline=f"Publish track #{track_id} to {platform}"
                + (" (dry run — no submit)" if dry_run else ""),
                sample=[
                    f"platform: {platform}",
                    f"audio_asset_id: {audio_asset_id}",
                    f"video_asset_id: {video_asset_id}",
                ],
                warnings=[
                    "Opens a real browser and uploads files; a human must finish at "
                    "the platform's verification gate.",
                ],
                risk="external",
            ),
        }
        return await submit_write("publish_track", payload)

    @mcp.tool(annotations=_READ_ANNOTATIONS)
    async def publish_status(
        job_id: Annotated[str, Field(description="The job_id returned by publish_track (in await_approval's result, or list_publish_jobs).")],
    ) -> dict:
        """Poll a publish job started by publish_track (Pro). Returns
        {job_id, stage, message, result?}. Stages: queued/launching/navigating/
        uploading_audio/uploading_cover/filling_metadata/uploading_deliverables/
        submitting/awaiting_review/awaiting_sms/done/failed. The job may PARK at
        'awaiting_review' or 'awaiting_sms' until a human acts at the browser — that is
        expected, not a failure. 'done' = published, 'failed' = error."""
        from beatos_publish.jobs import REGISTRY
        job = REGISTRY.get(job_id)
        if job is None:
            return {"error": "job not found", "job_id": job_id}
        return job.model_dump()


# --- ASGI app for FastAPI mount ---
app = mcp.streamable_http_app()
