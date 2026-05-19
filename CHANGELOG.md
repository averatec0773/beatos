# Changelog

All notable changes to BeatOS will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); BeatOS uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html) starting at `0.0.1`.

## [0.0.24] — 2026-05-19 — MCP write surface expansion

### Foundation
- Bumped default 2PC token TTL from 300s to 600s (bulk decisions deserve time).
- Removed the `BEGIN IMMEDIATE` workaround in `routes/tokens.py:approve_token`; obsolete since v0.0.23 made the sidecar the sole SQLite writer.
- Retired the deprecated `confirm_create_list` MCP tool. Use `await_approval` for status polling on any token (tool-agnostic).
- `await_approval` impl moved to its own file; envelope is now `{token, tool_name, status, result?}`.
- Added `RowVanishedError` for batch handlers to signal mid-approve row disappearance; routes/tokens.py maps it to HTTP 409 + rollback.
- Re-evaluated the `sm._has_started` private-attr guard in `beatos-http/app.py`: mcp 1.27.1 exposes no public `running`/`is_started` API, so `_has_started` guard is kept and `mcp` pin tightened to `>=1.27,<1.28` in `beatos-mcp/pyproject.toml`.

### Lifecycle write tools
- `trash_tracks(ids)` — soft delete, reversible via restore.
- `restore_tracks(ids)` — clears deleted_at.
- `purge_tracks(ids)` — PERMANENT physical delete (high-risk; checkbox-gated in approval card). ON DELETE CASCADE removes asset/track_list rows (requires PRAGMA foreign_keys=ON per connection, now enabled on approve_token's write connection). Source audio files on disk untouched.

### List-curation write tools
- `update_list(list_id, name)` — rename a user list (system lists immutable).
- `delete_list(list_id)` — PERMANENTLY delete a user list (checkbox-gated).
- `add_tracks_to_list(list_id, track_ids)` — append to tail; already-present ids skipped.
- `remove_tracks_from_list(list_id, track_ids)` — idempotent; missing ids skipped.
- `reorder_list(list_id, track_ids)` — full-membership reorder; mismatched membership rejected at token-create.

### Foundation (UI)
- `/approvals` cards now render a preview-aware layout: `payload.preview.headline` + sample + warnings + expand-all + high-risk variant. Destructive tokens (`purge_tracks`, `delete_list`) show a red card with an "I understand this is permanent" checkbox gate on Approve.
- Legacy `create_list` token rendering remains for tokens without a `preview` block (carries until v0.0.24 batch tools all ship).

### Metadata write tools
- `update_tracks(ids, patch)` — per-id partial update. Scalar fields set; multi-value (producer/genre/mood) accept list-replace OR {add, remove} delta. Tool-facing `key` maps to DB `key_signature`.
- `merge_metadata(field, from, to)` — library-wide alias collapse for producer/genre/mood. JSON1 scan; dedupes replacement values.

### Ingest write tools
- `create_tracks(items)` — batch create up to 100 empty track rows. Multi-value fields accept list[str].
- `attach_asset(track_id, role, path)` — attach an audio or cover file by absolute path. Extension validated against role. Existing role-slot is replaced in place (UNIQUE(track_id, role)). Handler re-checks file existence at approve time and writes `size_bytes`.

### AI-content write tool
- `draft_descriptions(items)` — batch-write `track.description_draft`. Never touches the live `description` field (UI-only promotion). v0.0.25 swaps the passthrough impl for real RAG generation.

## [0.0.23] - 2026-05-19 — MCP transport migration

### Changed
- MCP transport: stdio is now a thin `mcp-proxy` bridge to the sidecar's HTTP `/mcp` endpoint, instead of a separate stdio MCP server.
- `beatos-mcp` package role: now hosts FastMCP server + stdio launcher (no independent runtime).
- `beatos-http` sidecar now mounts the MCP ASGI app at `/mcp` (Streamable HTTP).
- `beatos-http` handshake file now includes `pid` for staleness detection.
- **Handshake file location** on macOS/Windows now matches Electron's `app.getPath('userData')` (`~/Library/Application Support/beatos-desktop/runtime/handshake.json`). Previously the Python `default_handshake_path()` used `BeatOS/` while Electron used `beatos-desktop/` — the launcher was reading a stale file and failing with "stale pid". Fixed by aligning the Python default to the Electron userData name.

### Added
- Tool annotations (`readOnlyHint`, `idempotentHint`) on every read tool and `await_approval`.
- `await_approval(token)` MCP tool — unified status-check across all 2PC write tools (replaces `confirm_create_list`).
- `outputSchema` + `structuredContent` on all tools (free from FastMCP).

### Deprecated
- `confirm_create_list(token)` — use `await_approval` instead. Removed in v0.0.24.

### Removed
- `mcp.server.stdio.stdio_server` runtime in `beatos-mcp`.

### Architecture
- Single-process SQLite ownership: `BEGIN IMMEDIATE` workaround for `SQLITE_BUSY_SNAPSHOT` no longer required (still present in code, will be cleaned up in v0.0.24).
- Claude Desktop user config unchanged (still invokes `beatos-mcp`).
- Claude Code / Cursor users can now configure via `claude mcp add --transport http`.

## [0.0.22] - 2026-05-19 — Source removal (full)

End-to-end deletion of the `Source` concept. The catalog now operates on individual files; folder-level auto-import (the watcher daemon) is retired in favor of manual drag-import. Schema reality made this safe: `track` and `asset` had no FK to `source.id` (confirmed at v0.0.21.1), so removal is a delete-only refactor with zero data migration on existing rows.

### Removed

- **Renderer:** `useSourceStore`, `@/api/sources`, `SourceRow`, `Sidebar/SourcesSection`, `lib/sourceOffline`, the `Settings → Sources` block, the dead `copyIntoSource` / `moveIntoSource` IPC bridges (`FS_COPY/MOVE_INTO_SOURCE` channels + main-process handlers + preload exposures + test mocks), `list_sources` from the displayed MCP tool list in `AIIntegrationSection`, `WelcomeScreen` (first-launch onboarded a Source — no longer needed), `QueueSourceKind` `"source"` variant, `source_id` field from `api.list` request shape.
- **Sidecar:** `beatos_core/sources/` (models, service, monitor) and `beatos_core/watcher/` (daemon + scanner) modules; `/api/sources` route family; MCP `list_sources` tool; `source_id` query param on `GET /api/tracks`; `source_id` kwarg on MCP-internal `list_tracks` helper; the `SourceStatusMonitor` + `WatcherRegistry` lifespan plumbing in `beatos_http/app.py`.
- **Schema:** migration `011_drop_source.sql` drops the `source` table.
- **Tests:** removed Source / watcher / `list_sources` test files; rewrote shared HTTP and core fixtures to attach assets by absolute path directly (no `SourceCreate` seed).

### Changed

- **Sidebar order:** `ALL BEATS → TRASH → LISTS → APPROVALS → footer` (was `SOURCES → LISTS → APPROVALS → TRASH → footer`). New `AllBeatsSection` with `Music` icon and live track count, mirroring `TrashSection`'s layout.
- **`OfflineBadge`** repurposed to read `asset.missing` (was driven by registered-Source online/offline status). Zero backend change — `asset.missing` was already maintained by the sweeper.
- **Smoke harness:** `assertSourceReorderApi` removed; new `assertSidebarOrder` appended to the end of the smoke block verifies the rendered sidebar exposes `All Beats / Trash / Lists / Approvals` top-down.

### Notes

- **All Beats count semantics**: the badge next to "All Beats" reflects the currently-loaded track list rather than the global library total. On `/`, this equals the library total; on `/lists/:id` or `/trash` it reflects the scoped view. Acceptable simplification for v0.0.22; can be tightened later if needed.
- **OfflineBadge dead path**: the `<OfflineBadge missing={asset.missing}/>` JSX in `AudioFileRow` / `CoverDropZone` / `AssetSlot` is unreachable in the rendering branch because each callsite has an unconditional early-return on `asset.missing`. Spec required keeping the component; the JSX is essentially dead code worth cleaning up in a follow-up.
- **Watcher retirement**: new files dropped into a folder no longer auto-appear in the catalog. Use drag-import. A future opt-in "migrate catalogued files into a managed dir" helper is planned (separate version) for users who want a tidy single-folder layout.
- **`QueueSourceKind` rename**: the renderer's `QueueSourceKind` / `QueueSource` types in `stores/player.ts` (with `kind: "all"` as the only variant after this version) remain — renaming to `QueueKind` / `Queue` is a separate follow-up to keep this diff focused.

## [0.0.21.4] - 2026-05-19 — Smooth list drag-reorder

Follow-up to v0.0.21.3. After the dragEnd dispatch was fixed, list reorder worked but felt rough compared to Source reorder: the green "+ drop track here" indicator flashed on target rows during list drags, and the SortableContext's row-shifting animation didn't run.

### Fixed

- **List drag-reorder now animates smoothly, matching Source behavior.** Root cause: each `SidebarListRow` registers two droppables — the outer `SortableContext` (`list:N`) and an inner `useDroppable("list-drop:N")` for track-drop targeting. Even after v0.0.21.3 routed `list-drop:N` to the reorder branch, the inner droppable was still active during list drags, so:
  1. dnd-kit's collision detection picked the inner droppable → outer Sortable lost its "over" target → no shift animation
  2. The inner droppable's `isOver` state flipped on, rendering the green "+" "drop track here" hint on the list being hovered (wrong feedback for a list drag)

  Fix: `SidebarListRow` now reads `active` from `useDndContext()` and passes `disabled: !activeIsTrack` to `useDroppable`. The inner droppable participates only during track drags; during list drags, only the outer `list:N` Sortable sees the pointer, so SortableContext runs its strategy and rows shift fluidly. Sources never had this issue because they only register one droppable per row.

### Notes

- v0.0.21.3's `App.tsx` dragend `list-drop:` fallback stays as defense-in-depth; the disabled-droppable fix makes it unreachable in normal flow, but it preserves correctness if the inner droppable is ever re-enabled.

## [0.0.21.3] - 2026-05-19 — Sidebar polish patches

Two small fixes after dogfooding v0.0.21.2.

### Fixed

- **Sidebar list drag-reorder didn't work.** Each `SidebarListRow` registers two droppables: the outer `SortableContext` (`list:N`) and an inner track-drop target (`list-drop:N`). When dragging one list over another, dnd-kit's collision detection picked the inner `list-drop:N` (because the button fills the inner rect), and `onDragEnd`'s reorder branch — which only matched `overId.startsWith("list:")` — fell through to the track-add branch and silently returned (because `activeId` was a list, not a track). `App.tsx::onDragEnd` now accepts either `list:N` or `list-drop:N` as a reorder target when `activeId.startsWith("list:")`.

### Changed

- **`TrashSection` no longer renders an uppercase "Trash" section header.** Matches `ApprovalsSection`, which has no header. The button itself is self-labeling. Sidebar visual rhythm is now consistent for single-button management sections.

## [0.0.21.2] - 2026-05-19 — Sidebar Approvals module

Promotes the v0.0.21 Pending Confirmations UI from `Settings → AI Integration` to a dedicated sidebar destination with a 24h recent-history view. `/approvals` is now the single source of truth for AI 2PC activity; Settings keeps only connection info.

### Added

- **Sidebar `Approvals` section** (`components/Sidebar/ApprovalsSection.tsx`) between `Lists` and `Trash`. Inbox icon + yellow count badge when pending > 0.
- **`/approvals` route** with `ApprovalsPanel` showing two stacked sections: Pending (with Approve / Reject buttons) and Recent (24h history with ✓ / ✗ / ⌛ status glyphs).
- **`usePendingTokensHistory` hook** — parallels `usePendingTokens`. Initial GET + SSE-driven refetch on the same `pending_changed` event.
- **`PendingList` + `HistoryList` components** (`components/Approvals/`) — focused row layouts for each section.
- **`GET /api/tokens?status=history`** — returns terminal-state (consumed / rejected / expired) tokens within the last 24h, sorted most recent first. Response includes `status`, `consumed_at`, and `result` fields not present in the pending response shape.

### Removed

- **`<PendingConfirmations>` block** in `Settings → AI Integration`. Single source of truth in `/approvals`.
- **`components/Settings/PendingConfirmations.tsx`** + its test. Logic folded into `Approvals/PendingList.tsx`.

### Notes

- 24h cutoff is hardcoded; if a future version needs longer windows, extend the route with a `?since=<epoch>` parameter rather than parameterizing `history`.
- Cleanup task (introduced v0.0.21) deletes terminal rows after 7 days, comfortably outside the 24h history window — history rows never disappear mid-session.

## [0.0.21.1] - 2026-05-19 — Drop OutOfSource attach guard

Quick-win patch ahead of the planned v0.0.23 Source-removal milestone. The "file must live inside a registered Source to attach" rule was UI-layer friction (Track and Asset have no `source_id` at schema level), so peeling it off is a small, contained change. Now: any absolute path on disk is acceptable as an asset (cover, audio, etc).

### Removed

- **`OutOfSourceError` exception** (`packages/beatos-core/beatos_core/assets/service.py`) — `attach_asset` no longer calls `find_source_for_path` / `list_sources` before inserting; the 4-line guard block and its imports are gone.
- **HTTP 422 `out_of_source` response** (`packages/beatos-http/beatos_http/routes/assets.py`) — the `except OutOfSourceError` handler dropped; attaches now return 200 from any path.
- **`OutOfSourceDialog` component** + its store + its mount in `App.tsx` + its test. ~200 LOC of renderer deleted.
- **`useAssetSlot.ts` + `AssetSlot.tsx`** — the 422-decode branch that opened the dialog is gone; attach errors now fall through to the generic `alert(...)` toast (only fires on real failures like missing file / permission denied).
- **`stores/dialogs.ts`** entire file (only contained the OutOfSource request state).

### Changed

- **`test_asset_service.py`** — `test_attach_raises_when_path_outside_any_source` flipped to `test_attach_accepts_path_outside_any_source` (asserts success now).
- **`test_assets_routes.py`** — `test_attach_out_of_source_returns_422` flipped to `test_attach_out_of_source_succeeds_v00211` (200 instead of 422).

### Notes

- `Source` data model, watcher daemon, sidebar/Settings Sources UI, and offline-badge derivation all unchanged. This patch only unhooks Sources from gating asset attachment. Full Source removal stays scheduled for v0.0.23 (see ROADMAP).
- 296 pytest + 248 vitest tests pass. Build clean.

## [0.0.21] - 2026-05-19 — First MCP write tool, 2PC activation

The 2PC token skeleton (v0.0.20) now powers a real write tool. AI agents request `create_list(name)`; the user approves in BeatOS Settings; the list is written atomically; the AI queries outcome via `confirm_create_list(token)`.

### Added

- **MCP write tools**: `create_list(name)` issues a 2PC token (does not write); `confirm_create_list(token)` reads back the eventual status (`awaiting_approval` / `approved` / `rejected` / `expired`).
- **HTTP token surface** under `/api/tokens`: `GET ?status=pending`, `POST /{token}/approve` (verify+insert+consume atomic), `POST /{token}/reject` (race-tolerant), `GET /stream` (SSE `pending_changed` feed).
- **Approve dispatcher** in `beatos_http/routes/tokens.py::_APPROVE_HANDLERS` — registry pattern; every future write tool registers one decorator.
- **Pending Confirmations UI** in `Settings → AI Integration` — SSE-driven real-time list with Approve / Reject per row. Empty state renders nothing.
- **Token cleanup background task** in sidecar — runs once on startup + hourly (sleeps first). Transitions pending → expired past TTL; deletes terminal rows older than 7 days.
- **`tokens.result` JSON column** (migration `010_tokens_result.sql`) — stores write outcomes so confirm tools have deterministic answers.
- **`use-click-outside` + `useApiBase` + `usePendingTokens` renderer hooks** — small composable utilities. `useApiBase` was missing; added now.

### Changed

- **`beatos_core.two_phase` (moved)** — was `packages/beatos-mcp/beatos_mcp/two_phase.py`, now `packages/beatos-core/beatos_core/two_phase.py`. Both `beatos-mcp` (issuance) and `beatos-http` (approve/cleanup) import from the shared core module; sibling-package imports would violate CLAUDE.md layering.
- **`verify_token` is now strictly read-only** — the v0.0.20 lazy-expire `UPDATE + COMMIT` was breaking outer transactions. The cleanup task owns `pending → expired` instead.
- **New helpers in `two_phase.py`**: `consume_token_with_result(conn, token, result)`, `reject_token(conn, token)` (no-op on terminal race), `get_token_status(conn, token)` (read-only), `cleanup_terminal_tokens(conn, max_age_days=7)`.
- **`beatos_mcp.db.connect_writable()`** — new context manager for write tools (does NOT set `PRAGMA query_only=1`). Read tools keep the existing `connect()` for defense-in-depth.
- **Approve handler uses `BEGIN IMMEDIATE` + `timeout=5`** — concurrent approvers under WAL no longer fail with `SQLITE_BUSY_SNAPSHOT`. Documented as CLAUDE.md rule 11.

### Migration

- `010_tokens_result.sql` adds a nullable `result TEXT` column. Existing DBs auto-apply on next BeatOS launch.

### Dependencies

- Added `sse-starlette>=2.1` to `beatos-http`.

### Notes

- Settings panel is the only surface for pending tokens in this version. Sidebar badge / global toast deferred to v0.0.22+ candidate.
- The hourly cleanup loop's failure case is logged but does not crash the sidecar; the loop continues.

## [0.0.20.3] - 2026-05-19 — Renderer polish + sidecar race fix

Three independent user-visible fixes from dogfooding, plus a sidecar concurrency bug surfaced while wiring v0.0.21 internals.

### Fixed

- **Auto-analyze double-fire on multi-asset import.** Dropping a track with several audio roles (tagged/untagged × WAV/MP3) used to fan out into N parallel sidecar analyses, leaving the "Analyze audio" button stuck and burning CPU. New shared `useAnalyzingStore` (Zustand) tracks an `inflight` dict keyed by track id; both `maybeAutoAnalyze` (auto path) and the manual button respect the lock. Concurrent calls for the same track de-dup; different tracks remain independent.
- **Action menus stay open after clicking elsewhere.** `AudioFileRow` and `CoverDropZone` overflow menus didn't close on outside-click. New `use-click-outside` hook (mousedown-based, no-op while disabled) closes them. Listens on mousedown rather than click so drag-selects that release outside still dismiss the popover.
- **Non-square cover images stretched parent layout.** `CoverImage` now always wraps in an `aspect-square` box with the inner `<img>` using `object-cover`. New `responsive` prop lets the wrapper fill parent width while staying square (used by `TrackDetailPanel`); fixed-size callers unchanged.
- **Sidecar `database is locked` on concurrent approves.** The token cleanup background task added during v0.0.21 prep was opening an eager first-iteration SQLite connection in parallel with the synchronous startup cleanup, racing the concurrent-approve test path. Two fixes: (1) `_periodic_token_cleanup` now sleeps 3600 s **before** its first run (synchronous startup cleanup already covers boot tidying), (2) the approve handler uses `BEGIN IMMEDIATE` + `timeout=5` so concurrent approvers queue and wait instead of failing with `SQLITE_BUSY_SNAPSHOT`.

### Notes

- This release is cut from the in-progress `v0.0.21` branch — it includes internal 2PC scaffolding (migration 010, `/api/tokens/*` endpoints, SSE stream) that no user-facing flow exercises yet. The MCP write tools `create_list` / `confirm_create_list` are not registered until v0.0.21 ships.
- 285 pytest + 238 vitest tests pass.

## [0.0.20.2] - 2026-05-18 — MCP console script ship fix

First real Claude Desktop end-to-end verification (the v0.0.20 layer-3 hand-off) caught a ship-blocker: the `beatos-mcp` command that README, CLAUDE.md, and Settings → AI Integration all reference was never registered. `uv run beatos-mcp` failed with `Failed to spawn: 'beatos-mcp' — No such file or directory`, so no MCP client could ever connect.

### Fixed

- **`packages/beatos-mcp/pyproject.toml`** — added `[project.scripts]` block registering `beatos-mcp = "beatos_mcp.__main__:main"`. `beatos_mcp/__main__.py` already had the `main()` function; it just wasn't exposed as a console script. After `uv sync`, `uv run --directory <repo> beatos-mcp` now spawns the stdio MCP server correctly. Verified in Claude Desktop with `list_sources` returning the live 4-source library.

### Notes

- README + AIIntegrationSection config snippet template was correct all along; the package metadata was the only thing missing.

## [0.0.20.1] - 2026-05-18 — resizer self-heal + missed desktop bump

Patch release for one user-reported regression caught after the v0.0.20 tag.

### Fixed

- **`apps/desktop/src/renderer/src/components/ColumnResizer.tsx`** — title-column auto-expanded on hover (no click) when a prior `pointerup` was lost (OS-cancelled capture, drag past window edge). The resizer now bails when `e.buttons === 0` on `pointermove`, and `endDrag` is wired to `pointerup` + `pointercancel` + `lostpointercapture` so a missed release self-heals on the next interaction. Capture is also taken on `e.currentTarget` (stable outer div) instead of `e.target` (could be the inner divider span).

### Changed

- **`apps/desktop/package.json`** bumped `0.0.19.1 → 0.0.20.1`. The v0.0.20 release commit (`8363dcc`) only bumped Python `pyproject.toml` versions; the desktop package was missed. Caught and corrected here.

## [0.0.20] - 2026-05-18 — Stable MCP Framework

### Architecture
- SQLite WAL mode enabled in `run_migrations` so BeatOS HTTP sidecar and `beatos-mcp` can share the DB without lock contention.
- 2PC token skeleton landed: `migrations/009_tokens.sql` + `beatos_mcp.two_phase` (create/verify/consume). Unblocks v0.0.21+ write tools.
- `beatos-mcp` connections open with `PRAGMA query_only=1` as defense-in-depth.

### Added
- 6 MCP read tools: `ping`, `list_tracks(filter?)`, `get_track`, `list_sources`, `list_lists`, `list_distinct_values`. Filters mirror the HTTP `/api/tracks` query params; `list_tracks` paginates with `{items,total,returned,limit,offset,hint?}` (default 50, max 500).
- `BEATOS_DB_PATH` env-var discovery for the MCP server, with actionable errors if unset or pointing at a missing file.
- Settings → "AI Integration" panel (collapsed by default): status + DB path + auto-filled Claude Desktop config JSON + Copy buttons + Test connection button that spawns the MCP server and reports tool count.
- `packages/beatos-mcp/README.md` — usage + Claude Desktop config example.

### Changed
- `beatos-mcp` `__version__` bumped from `0.0.1` → `0.0.20`. `ping` now returns the actual package version; `test_ping.py` reads it dynamically.
- MCP logs land at `~/Library/Logs/beatos/mcp.jsonl` (mac) / `%APPDATA%\beatos\logs\mcp.jsonl` (win) via structlog. stdout is reserved for JSON-RPC protocol.
- Root `pyproject.toml` gains `addopts = "--import-mode=importlib"` to fix `uv run pytest` collection failure caused by two `test_db.py` files in different packages.

### Migration
- `009_tokens.sql` adds a new table; existing DBs auto-apply on next BeatOS launch. No user-visible change.

### Notes
- Read-only tools only in this version. Write tools (e.g. `import_track`) follow in v0.0.21 on the 2PC skeleton.
- `search_tracks` is intentionally deferred to v0.0.23 (RAG) — `list_tracks` covers ~80% of read intents via structured filters.

## [0.0.19.1] - 2026-05-18 — post-refactor audit + cleanup

Two parallel sub-agents reviewed the v0.0.17–v0.0.19 refactor pass. One real bug + three loose ends found and fixed.

### Fixed

- **`apps/desktop/src/renderer/src/hooks/use-track-editor-state.ts`** — title-input auto-focus effect had `[]` dependency, violating CLAUDE.md rule 7 (SPA route reuse). Navigating `/tracks/1/edit → /tracks/2/edit` reuses the same `TrackEditor` instance, so `useEffect([])` does not re-run — the title field never re-focused for the second track. Changed to `[params.id]`. Pre-existing bug; the v0.0.18 split surfaced it but didn't introduce it.

### Removed

- **`apps/desktop/src/renderer/src/components/ListSidebarSection.tsx`** — dead file. Superseded by `components/Sidebar/ListsSection.tsx` in v0.0.17; zero importers since then.

### Changed

- **`apps/desktop/scripts/smoke.mjs`** — dropped `logsDir` and `ts` from the `ctx` payload. They were forwarded into `runAssertions` but no section ever read them.
- **`apps/desktop/scripts/smoke/library.mjs`** — `assertSeedAndDragDrop` was destructuring `app` from `ctx` and ending with a `void app; // kept for future use` suppressor. Both removed.
- **`apps/desktop/src/renderer/src/components/Sidebar/SourcesSection.tsx`** — replaced `useListStore((s) => s.all)` + `useMemo find` with a stable-boolean selector `useListStore((s) => s.all.some((l) => l.kind === "system"))`. The component never read the system-list object's fields, only its existence. The full-array selector forced re-renders on any list mutation (rename/add/delete); the boolean selector only re-renders when the system list itself appears or disappears.

### Verification

233 vitest tests pass, 33 smoke assertions pass, smoke output byte-identical to v0.0.19 baseline.

## [0.0.19] - 2026-05-18 — smoke.mjs split

Third entry of the refactor pass. The 1500-line smoke harness was a single try-block sharing scope across all 33 assertions; we kept it that way as long as we did because CLAUDE.md §"Smoke assertion order is load-bearing" warned against reorganization. This version preserves that order exactly while splitting into a runner + per-domain section files.

### Changed

- **`apps/desktop/scripts/smoke.mjs` (1540 → 135 lines)** — thin entry. Builds the `ctx` object (app/window/userData/baseUrl/fixtures/flags/api closures), invokes `runner.runAssertions(ctx)`, prints PASS/FAIL, cleans userData. The boot block (window mount + console capture + sidecar log validation + screenshot) stays here because it's pre-assertion setup.
- **`apps/desktop/scripts/smoke/runner.mjs`** (NEW, 69 lines) — calls the 28 section functions in original chronological order. The order comments preserve the v0.0.X markers from the source so future agents can map sections back to the commits that added them.
- **`apps/desktop/scripts/smoke/fixtures.mjs`** (NEW, 74 lines) — pure data + builders: `TINY_PNG`, `makeTinyWav`, `makeDawStyleWav`. No I/O.
- **`apps/desktop/scripts/smoke/setup.mjs`** (NEW, 141 lines) — `bootstrapPaths`, `launchApp`, `purgeOldArtifacts`, `checkSidecarLog`, `readHandshakeBaseUrl`, `makeApi(baseUrl) → { postJson, putJson }`.
- **`apps/desktop/scripts/smoke/library.mjs`** (NEW, 471 lines) — `assertSeedAndDragDrop` (seeds `ctx.fixtures.{t1,t2,list,coverAsset}`), `assertEmptyListCopy`, `assertFilterChips`, `assertSortTitle`, `assertColumnResizerDrag`, `assertColumnAlignmentAfterResize`, `assertScrollSync`, `assertTableAlignment`.
- **`apps/desktop/scripts/smoke/player.mjs`** (NEW, 212 lines) — `assertAttachAudioAndBottomBar`, `assertNoAudioDisabled`, `assertRowClickPopulatesBar`, `assertPlaybackStarts` (sets `ctx.flags.playbackStarted`), `assertResumeAfterEnd`, `assertDawWavDecode`, `assertRealAudioRegression`.
- **`apps/desktop/scripts/smoke/editor.mjs`** (NEW, 404 lines) — `assertDoubleClickOpensEditor`, `assertKeyPickerRoundTrip`, `assertAutoSavePersists`, `assertEmptyTitleGatesSave`, `assertGenreChipSelect`, `assertProducerCustomChip`, `assertCoverDragSource`, `assertAnalyzeEndpointShape`, `assertAnalyze404OnNoAudio`, `assertProducerRewriteMerge`. Private `ensureEditorOpen(window)` helper centralises the editor-open boilerplate previously duplicated in three places.
- **`apps/desktop/scripts/smoke/trash.mjs`** (NEW, 33 lines) — `assertTrashSoftDeleteRestore`.
- **`apps/desktop/scripts/smoke/sidebar.mjs`** (NEW, 60 lines) — `assertDropCreateApiPath`, `assertSourceReorderApi`.

### Verification

33/33 smoke assertions pass with byte-identical PASS output (compared line-by-line to the v0.0.18 baseline). 233/233 vitest tests pass — no renderer code was touched.

### Notes

- **`ctx` shape** is the cross-section contract. Section functions read `ctx.app/window/userData/baseUrl/fixtures/flags/postJson/putJson/TINY_PNG/makeTinyWav/makeDawStyleWav/failures/rendererConsole`, mutate `ctx.failures` and `ctx.fixtures.*` (e.g. `seedAndDragDrop` writes `t1/t2/list/coverAsset`; `attachAudioAndBottomBar` writes `audioAsset/audioPath`). When adding a new section, document any `ctx.fixtures.*` it adds.
- **Order constraint preserved**: `runner.mjs` calls the 28 functions in the same order the assertions originally fired. Reordering them risks state assumptions (e.g. `assertResumeAfterEnd` requires `assertPlaybackStarts` to have set `ctx.flags.playbackStarted`).

## [0.0.18] - 2026-05-18 — TrackEditor refactor

Second entry of the v0.0.17+ refactor pass. Structural-only — no behavior change. `routes/TrackEditor.tsx` was 501 lines; now the route is 35 lines and the responsibilities are split into a state hook, a form component, a save-indicator component, and a pure-helpers module.

### Changed

- **`apps/desktop/src/renderer/src/routes/TrackEditor.tsx` (501 → 35 lines)** — thin container. Reads `loadError` / `track` for the loading + error early-returns, renders `<AnalyzeResultDialog>` + `<TrackEditorForm>`. All state and effects moved out.
- **`apps/desktop/src/renderer/src/hooks/use-track-editor-state.ts`** (NEW, ~220 lines) — `useTrackEditorState()` owns the form lifecycle: track / initialTrack load, dirty tracking, debounced auto-save (`AUTOSAVE_DEBOUNCE_MS`), upstream auto-analyze patch absorption (writes both `track` AND `initialTrack` so the upstream write doesn't re-fire auto-save — preserves the v0.0.15 invariant), per-track-id producer-distinct refresh (caught at v0.0.14.1: `useEffect([])` went stale across SPA route reuse), ESC keybinding, analyze runner + dialog open state, delete confirm, `patch<K>()` setter. Returns one object consumed by route + form.
- **`apps/desktop/src/renderer/src/components/TrackEditor/TrackEditorForm.tsx`** (NEW, ~210 lines) — receives `{ track, state }` and renders the form body (cover slot, analyze button, title + BPM + Key + Genre + Mood + Producer + License + Tags + Description + FileRowsSection + Close/Delete row). Producer rename/delete callbacks call `producersApi.rewrite` + `state.refreshProducerOptions` + local `patch` — same logic, now in one place.
- **`apps/desktop/src/renderer/src/components/TrackEditor/SaveIndicator.tsx`** (NEW, ~55 lines) — extracts the four-state save-status pill (title-required → saving → error+retry → saved · Xs ago). `data-save-status` attribute preserved for smoke + test hooks.
- **`apps/desktop/src/renderer/src/lib/track-editor-helpers.ts`** (NEW) — pure helpers: `buildPayload(t)`, `formatSavedAgo(ms)`, `LICENSE_TYPES`, `AUTOSAVE_DEBOUNCE_MS`, `SaveState` type. Easy to test in isolation; importable by route, form, hook, and indicator without circularity.

### Verification

233 vitest tests pass (including the 4 TrackEditor auto-save tests, which import via the same `@/routes/TrackEditor` path), 33 smoke assertions pass.

## [0.0.17] - 2026-05-18 — SidebarPanel refactor + top-bar polish

First entry of the v0.0.17+ refactor pass: structural-only, no feature changes. Plus a small visual fix to the top bar so it aligns better with the macOS traffic-light buttons, and a developer credit pinned to the sidebar footer.

### Changed

- **`apps/desktop/src/renderer/src/routes/SidebarPanel.tsx` (445 lines)** split into `components/Sidebar/`:
  - `SidebarPanel.tsx` — thin orchestrator (~85 lines): owns the `<aside>` shell, sidebar-width resizer, and the per-mount `refresh()` effect for the three stores it drives.
  - `SourcesSection.tsx` — Sources header + AllBeats row + sortable source list. Co-locates `SortableSourceRow`. Pulls its own state from `useSourceStore` / `useListStore`.
  - `ListsSection.tsx` — Lists header + add-list inline input + sortable user-list rows. Co-locates `SortableListRow` and `SidebarListRow` (rename / delete / drop-target logic).
  - `TrashSection.tsx` — Trash header + Trash route button + count badge.
  - `SidebarFooter.tsx` — `@averatec0773` developer credit link, `mt-auto` to pin to the bottom of the sidebar.
- **`apps/desktop/src/renderer/src/components/TopBar.tsx`** — height `h-12 → h-14`, `paddingLeft 84 → 88px`, title font `text-sm → text-[15px]`, divider `h-4 → h-5`. Fixes the visual misalignment between the title row and the macOS traffic-light buttons (the buttons sit ~13 px from window top; the previous 48 px header centered text below them).
- **`apps/desktop/src/renderer/src/components/TopBarRouteTitle.tsx`** — route title font `text-sm → text-[15px]` to match.
- Import sites updated: `routes/AppShell.tsx` and `__tests__/SidebarPanel.test.tsx` now import `SidebarPanel` from `@/components/Sidebar/SidebarPanel`. Old `routes/SidebarPanel.tsx` deleted.

### Roadmap

- **MCP path to v0.1.0 locked in.** `ROADMAP.md` gains explicit v0.0.20 / v0.0.21 / v0.0.22 entries: read-only tools → two-phase commit infrastructure → `draft_description` placeholder. Built on the existing `packages/beatos-mcp/` shell, which currently only exposes `ping`. Search upgrade slides from v0.0.18 → v0.0.23.

### Verification

233 vitest tests pass, 33 smoke assertions pass.

## [0.0.16] - 2026-05-18 — Tone.js audio engine + layout fixes

### Architecture

- **Audio playback migrated from HTML5 `<audio>` to Tone.js / Web Audio API.** New `apps/desktop/src/renderer/src/lib/audio-engine.ts` is a singleton wrapper around `Tone.Player` + `Tone.ToneAudioBuffer` with a byte-budgeted LRU buffer cache (256 MB), RAF-driven `timeupdate` + `ended` detection, and an event-emitter surface (`statuschange` / `timeupdate` / `durationchange` / `ended` / `error`). `usePlayerStore` delegates all transport control to the engine; module-level engine→store subscriptions replace the five-`useEffect` sync chain that previously lived in `BottomPlayerBar`.
- **Why Tone.js, not raw Web Audio.** `Tone.Transport.bpm` becomes the canonical BPM knob (future MCP `playback.set_bpm`); `Player.playbackRate` / `loopStart` / `loopEnd` / effects chains all become one-liners. The HTML5 `<audio>` element's WAV decoder was rejecting DAW-default FLOAT-32 bounces and silently stalling on window-focus loss — Web Audio's `decodeAudioData` handles FLOAT-32 / 24-bit / WAVE_FORMAT_EXTENSIBLE natively, and `AudioContext` is the right abstraction for a beat-producer's needs going forward.

### Added

- **`audio-engine.ts`** — singleton Tone wrapper with byte-budgeted LRU cache (`BUFFER_CACHE_BUDGET_BYTES = 256 MB`, `bufferSizeBytes()` accounts for `numberOfChannels × length × 4`), AudioContext suspend detection inside the RAF tick (laptop sleep, output-device change → clean pause with captured position, never phantom drift), and a `clearListeners()` escape hatch for isolated unit tests. Public surface: `load(assetId)` / `play()` / `pause()` / `stop()` / `seek(s)` / `setVolume(v)` / `setMuted(b)` / `setForceMuted(b)` / `setBpm(b)` / `getCurrentPosition()` / `on(event, cb)`.
- **`window.__beatos.engine()`** — snapshot of engine state (`status`, `duration`, `position`, `currentAssetId`, `bpm`) for smoke / DevTools introspection.
- Smoke renderer-console capture: failures now print the last 20 `error` / `warning` lines from the renderer console.
- Vitest suite `audio-engine.test.ts` covers default state, listener lifecycle, statuschange / durationchange emission, BPM round-trip, dispose-and-rebuild.

### Changed

- **`apps/desktop/src/main/index.ts`** — `BrowserWindow.webPreferences` gains `backgroundThrottling: false`. Chromium's default throttles renderer timers + audio decoding when the window loses focus; on macOS this surfaced as playback stalling whenever the user switched to a VS Code window on another monitor. BeatOS is an audio app, so always-on priority is correct.
- **`apps/desktop/src/main/index.ts`** — `protocol.registerSchemesAsPrivileged` for `beatos-asset` gains `corsEnabled: true`. The renderer's origin is `file://`, which Chromium otherwise treats as cross-origin to custom schemes; without this, Tone.js / `decodeAudioData` `fetch()` calls fail with `net::ERR_FAILED` on a CORS preflight that never runs.
- **`apps/desktop/src/renderer/index.html`** — CSP gains `worker-src 'self' blob:` (Tone v15 instantiates AudioWorklet processors from `URL.createObjectURL(new Blob(...))`; without the directive, `script-src 'self'` falls back to block them) and `connect-src beatos-asset:` (allows `fetch` to the custom protocol).
- **`apps/desktop/src/main/asset-protocol.ts`** — `repairWavIfNeeded` simplified: dropped the FLOAT-32 → PCM-16 transcode path (~80 lines). Web Audio's `decodeAudioData` handles `fmt.format=3` natively, so we no longer rewrite samples. RIFF junk-chunk stripping (JUNK / cue / LIST / smpl / bext) and EXTENSIBLE → plain-format-code unwrap are still kept — Chromium's decoder remains picky about unusual chunk structure even via Web Audio.
- **`apps/desktop/src/renderer/src/stores/player.ts`** — heavy rewrite. `loadEpoch` counter deleted (the engine's state machine subsumes the "force reload" trick from v0.0.15). `togglePlay` / `seek` / `next` / `prev` / `setPreferredRole` delegate to `audioEngine.{play,pause,seek,load}`. Module-level subscription (`audioEngine.on(...)`) wires `statuschange` / `timeupdate` / `durationchange` / `ended` → store, so tests can mock the engine without mounting `BottomPlayerBar`.
- **`apps/desktop/src/renderer/src/components/BottomPlayerBar.tsx`** — removed the `<audio>` element and its five `useEffect` sync hooks (audio.src, play/pause, seek, volume, onError). A single `useEffect` now initializes forceMuted / volume / muted on the engine and subscribes to `error` for the decode-failure toast. Slider drag → `usePlayerStore.seek(v)` → `audioEngine.seek(v)`. Net: 148 lines deleted, 16 lines added.
- **`apps/desktop/src/renderer/src/main.tsx`** — exposes `audioEngine` snapshot through `window.__beatos.engine()` alongside the existing store debuggers.

### Fixed

- **Library table column alignment** — `TableHeader` + `TrackRow` rewritten to CSS Grid sharing the same `gridTemplateColumns` (computed by `lib/table-layout.ts::getGridTemplateColumns(widths)`). Cell edges now align by construction across rows whose content differs (e.g. row with producer subtitle vs row without). `ColumnResizer` lifted from inline-flex spacer to absolutely-positioned cell-edge overlay; the divider line is `bg-text-tertiary` (visible at rest) and brightens on hover.
- **Horizontal scroll header↔body desync** — the previous layout had two independent X-scroll containers (shared `overflow-x-auto` wrapper + body's `overflow-y-auto` auto-promoted to `overflow-x: auto`). Now the body is the **only** X-scroll source of truth: header lives in a separate `beatos-scroll`-wrapped div (scrollbar hidden via CSS) and its `scrollLeft` is mirrored from `VirtualTrackList.onScrollLeftChange`. A reverse-sync `useEffect` lets trackpad horizontal swipes on the header drive the body too. Smoke gains a `header tracks body scrollLeft` assertion.
- **Sidebar resizable** — new `useSidebarPanelStore` (180–360 px clamp, sessionStorage) + right-edge drag handle, mirroring the preview-panel pattern.
- **`next` / `prev` follow the visible list, not the raw track list** — `TrackRowPlayButton` queues from `useSearchStore.filter(useTrackStore.list)`. `BottomPlayerBar.handlePrev / handleNext` first rebuild the queue from the current visible filter via the new `usePlayerStore.syncQueue(ids, anchorTrackId)` action, then dispatch to `prev` / `next`. Shuffle mode is preserved across syncs (the shuffle order is regenerated for the new ids, anchored to the current track). Fixes "click next jumps to an off-screen track" and "single-visible queue pauses on next".
- **Track-switch cycle "A → empty track → A" left A unable to play** — `audioEngine.load()`'s early-return path (same asset already loaded) now resets RAF + re-emits `paused` + `durationchange` + `timeupdate` so the store can never get stuck at `status: "loading"` after a prior `stop()` left the engine idle. `BottomPlayerBar.handleTogglePlay` also falls back to the selected row when the player is in `error` / `idle` state.
- **Playback stalls when the window loses focus** (cross-monitor switch to VS Code, command-tab, etc.) — caused by Chromium's `backgroundThrottling`, fixed via webPreferences as above.
- **Smoke probe updated** — `document.querySelector("audio")` doesn't exist anymore. Smoke now reads `window.__beatos.engine()` for playback assertions; DAW-WAV regression and `BEATOS_REAL_AUDIO=<path>` both PASS against a real 208 s FLOAT-32 user export. Diagnose harness `scripts/diagnose-playback.mjs` rewritten to poll engine state instead of the now-nonexistent `<audio>` element.

### Removed

- HTMLAudioElement playback path and its supporting machinery (`loadEpoch` reload counter, five `useEffect` sync hooks in `BottomPlayerBar`, FLOAT-32 → PCM-16 transcode in `repairWavIfNeeded`). All superseded by the Tone engine.

### Notes

- **Bundle:** renderer JS grew from 1348 KB → 1976 KB raw (+628 KB; estimated ≤ 90 KB gzipped). Tone v15.1.22 is the cost.
- **Tests:** 233 vitest (227 + 6 new audio-engine) / smoke PASS including DAW-WAV and `BEATOS_REAL_AUDIO=<user-wav>`.
- **Cache budget:** 256 MB byte-budgeted LRU. Holds ~3 of the worst-case 208 s × 44.1 kHz × 2 ch × FLOAT-32 buffers (~73 MB each), or 50+ typical 8-bar loops.
- **Known gap:** `navigator.mediaDevices.ondevicechange` (headphones plug / unplug) isn't yet handled explicitly. The RAF tick's `ctxState !== "running"` check catches outright suspends, but a silent route-change without state transition isn't surfaced. Deferred.

## [0.0.15] - 2026-05-18 — Auto-save, smoke housekeeping, producer management

### Added

- **Auto-save in TrackEditor** — debounced 800 ms after the last edit; replaces the manual Save button and `UnsavedChangesDialog`. Gated on a non-empty title; error state pauses auto-retry until the user edits again. ESC / Close button flushes one final save before navigation. `data-save-status` attribute drives smoke + tests.
- **Producer management** — `POST /api/producers/preview` and `POST /api/producers/rewrite {from, to}` cover rename / merge / delete in one unified shape (`to: null` = delete). Atomic single-transaction rewrite; preview returns the affected-track count.
- **Settings → Producers section** — list with a per-row Remove button (mirrors the Sources section). No confirmation dialog: removing immediately strips the producer from every track. Renames and merges live in the ChipMultiSelect ⋯ menu (renaming to an existing name effectively merges).
- **ChipMultiSelect `⋯` per option** — hover-revealed manage button reveals an inline tray (rename input + delete + cancel) inside the picker. Wired for the Producer field in TrackEditor; commits via `/api/producers/rewrite`, then refreshes the distinct list.
- **Closable + resizable preview panel** — right-side `TrackDetailPanel` gains an X close button, a left-edge hover resizer (280–600 px clamp), and a TopBar toggle (`PanelRightOpen` / `PanelRightClose`). Open / width state persists across reloads via sessionStorage.
- **Headless + muted test mode** — `BEATOS_HEADLESS=1` keeps the main window invisible; `BEATOS_AUDIO_MUTED=1` force-mutes every `<audio>` element via a preload-exposed flag. Smoke and `diagnose-playback.mjs` default to both on; pass `SMOKE_SHOW=1`/`SMOKE_UNMUTED=1` (or `DIAG_*`) to opt back in.
- Smoke regression #33: two tracks with case-different producer names → `POST /api/producers/rewrite` collapses them to one; distinct API no longer returns the merged-away spelling. Placed at the end of the block (state-mutating).
- Smoke regression #34 (`BEATOS_REAL_AUDIO=<path>`): end-to-end playback against a real studio WAV — verifies muted, duration > 0, currentTime advances.
- Smoke regression — row body click immediately populates the bottom player bar (title visible, play button enabled).
- Smoke regression — TableHeader / TrackRow column alignment: 5 columns must share left + right edges within 1 px. Guards against ColumnResizer / row-spacer geometry drift.
- `scripts/inspect-table-widths.mjs`: standalone diagnostic that prints the exact rendered geometry of every header column vs the first row cell. Reach for it when alignment regresses.

### Fixed

- **IEEE FLOAT-32 WAV playback** — Chromium's WAV decoder rejects `fmt.format=3` (32-bit float PCM) with empty-message `MEDIA_ERR_SRC_NOT_SUPPORTED`. Modern DAWs (FL Studio, Logic, Ableton, Pro Tools) default to FLOAT-32 for high-quality bounces, so this format hit user tracks immediately. `repairWavIfNeeded` now transcodes FLOAT-32 → signed 16-bit PCM inline (clamp to [-1, 1], scale by 32767 / 32768), rewriting the `fmt` block to `format=1 bitsPerSample=16` and the data chunk to int16-LE. Also unwraps `WAVE_FORMAT_EXTENSIBLE (0xFFFE)` to the underlying SubFormat (1=PCM or 3=FLOAT, the latter then flows into the transcode path). Verified end-to-end with a real 70 MB / 208 s DAW export.
- **Table column desync after user resize** — `TrackRow`'s inter-column spacers were `w-1 flex-shrink-0` (4 px) while `TableHeader`'s `<ColumnResizer>` is `w-3 -mx-1 flex-shrink-0` (12 px box, 4 px effective via negative margins). At default widths the title `flex-1` absorbed the 8 px / spacer discrepancy, but once any column was pinned to a fixed pixel width, the row drifted right of the header by ~32 px across the 4 spacers. TrackRow spacers now use the same `w-3 -mx-1 flex-shrink-0` geometry. Smoke now also asserts alignment AFTER programmatically widening title to 400 px.
- **Selection highlight truncates when columns overflow** — `VirtualTrackList`'s parent had only `overflow-y-auto`; once row content exceeded the section width, the row `bg-bg-row-selected` background stopped at the viewport edge. Wrapped `<TableHeader>` + `<VirtualTrackList>` in a shared `overflow-x-auto min-w-0` container, and set `min-width: max-content` on both the header row and each `TrackRow` so they grow with their content. The selection highlight now extends to the full row width, and horizontal scroll keeps the header synced with the rows.
- **Bottom player bar reflects row selection** — `BottomPlayerBar` falls back to `useTrackStore.current` when the player has no loaded track. Clicking a row now immediately populates the bar (cover + title + producer subtitle) and enables the play button, instead of leaving the bar empty until the user hovered the row's play overlay. Pressing the bottom play button while in fallback mode triggers `playFromQueue` against the visible track list, so prev / next keep working after the first play.
- **Stuck playback recovery** — `usePlayerStore` gains a `loadEpoch` counter that increments on every `loadAndPlay()`. The `BottomPlayerBar` audio-src effect now depends on `[currentAssetId, loadEpoch]`, so retrying the same asset (after an `onError`) actually re-runs `audio.src = …; audio.load()`. Previously the effect was a no-op when the assetId didn't change — the audio element stayed wedged and the timer froze at 0:00 until the user switched format (WAV ↔ MP3) to force an assetId delta.
- **Library Updated column** changed from a fixed `widths.updated` to `flex-1 min-w-[80px]` in both `TableHeader` and `TrackRow`, so the column absorbs remaining horizontal space and the cell text is no longer clipped when the preview panel is open on smaller windows.

### Changed

- `apps/desktop/scripts/smoke.mjs` startup pass: deletes `logs/smoke-<digits>.{png,jsonl}` files with `mtime` older than 3 days. Regex-gated; `main.log`, `sidecar.jsonl`, and other shapes are untouched. Logs `purged N stale artifact(s)` when files actually fall out; silent otherwise.
- `rewrite_producer` always counts a matched track as `affected` even when the resulting JSON is byte-identical to the original (e.g. the merge target already holds the canonical name). This keeps `/preview` and `/rewrite` counts consistent; no-op rows still skip the SQL `UPDATE` (no needless `updated_at` bumps).
- `loadAndPlay` accepts a `targetStatus: "playing" | "preserve"` argument. `setPreferredRole` (WAV ↔ MP3 switch) and manual `next()` / `prev()` now pass `"preserve"` so a paused user stays paused after the switch. Explicit play intent (`playFromQueue` from a row's play button) and the natural end-of-track advance keep the default `"playing"`.
- `BottomPlayerBar` + `TrackRow` display producer arrays sorted alphabetically (independent of insert order).

### Changed

- `apps/desktop/scripts/smoke.mjs` startup pass: deletes `logs/smoke-<digits>.{png,jsonl}` files with `mtime` older than 3 days. Regex-gated; `main.log`, `sidecar.jsonl`, and other shapes are untouched. Logs `purged N stale artifact(s)` when files actually fall out; silent otherwise.
- `rewrite_producer` always counts a matched track as `affected` even when the resulting JSON is byte-identical to the original (e.g. the merge target already holds the canonical name). This keeps `/preview` and `/rewrite` counts consistent; no-op rows still skip the SQL `UPDATE` (no needless `updated_at` bumps).

### Removed

- `apps/desktop/src/renderer/src/components/UnsavedChangesDialog.tsx` and the dirty-tracking / blocker plumbing it required. Auto-save makes the prompt obsolete.

### Notes

- 33 smoke (34 with `BEATOS_REAL_AUDIO` set) / 222 vitest / 224 sidecar pytest all pass.

## [0.0.14.1] - 2026-05-17 — Playback for DAW-produced WAVs

### Fixed

- **Recurring "Playback stuck" / "SRC_NOT_SUPPORTED" bug** with WAVs exported from DAWs (Pro Tools, FL Studio, Logic). Root cause: Electron 39's Chromium WAV decoder silently rejects RIFF files that contain a `JUNK` chunk before `fmt ` (sector-align padding) or `cue `/`LIST`/`smpl` chunks after `data` (markers, metadata). Prior fixes targeted transport (Range header, buffering, MIME normalization, retry watchdogs) and never resolved the parser-level rejection. Diagnosed with a new `apps/desktop/scripts/diagnose-playback.mjs` harness — SRC_NOT_SUPPORTED fired within 80 ms, too fast to be transport.

### Added

- `repairWavIfNeeded()` in `apps/desktop/src/main/asset-protocol.ts`: rebuilds a minimal `RIFF`→`fmt `→`data` WAV from any input, preserving every audio byte verbatim. Zero-copy fast path for clean WAVs; runs only when needed. Bounded against malformed chunk sizes.
- 8 unit tests in `apps/desktop/src/main/__tests__/asset-protocol.test.ts` covering clean / DAW / non-WAV / un-repairable / malformed-size inputs.
- Smoke regression #30: synthesizes a DAW-style WAV (JUNK + trailing `cue ` chunks), attaches it, clicks play, asserts `audio.duration > 0` and `currentTime` advances after 1.5 s.
- `apps/desktop/scripts/diagnose-playback.mjs`: standalone harness for future audio playback investigations. Takes `BEATOS_TEST_AUDIO=` or `--tiny`/`--large`; instruments every HTMLMediaElement event.

### Changed

- Asset protocol now buffers the full upstream body before responding (required to apply WAV repair across the whole file) and returns 200 OK without `Accept-Ranges`. Chrome's two-phase WAV probe over a proxied range chain was a fragile signal source; one bounded full-file fetch is simpler and the per-play cost (~10-30 ms for typical files) is imperceptible. Non-audio assets (covers) unaffected.
- Normalize `audio/x-wav` and `audio/vnd.wave` MIMEs to `audio/wav`.
- Bottom player: dropped the 5 s blanket "stuck-load" watchdog (wrong-theory false positives on slow disks). `onError` catches real failures within 80 ms. State machine simplified.

### Notes

- Fix is purely byte-level RIFF surgery — no transcoding, no codec dependency, no audio quality impact.
- 30 smoke / 212 vitest / 213 sidecar pytest all pass.

---

## [0.0.14] - 2026-05-17 — Drag-and-Trash

### Added

- **Trash** (soft-delete): right-click → Delete now moves a track to trash instead of hard-deleting. New TRASH section in sidebar with live count; `/trash` view lists trashed tracks with per-row **Restore** and **Delete forever** actions. List membership (`list_track` rows) preserved across delete/restore.
- **Sidebar reorder**: drag Sources within SOURCES, or Lists within LISTS, to reorder. Persisted via `POST /api/sources/reorder` and `POST /api/lists/reorder` bulk endpoints (single transaction). System list "All Beats" excluded from sortable.
- **Whole-row drag handle**: dragging anywhere on a track row now starts the list-membership drag (was previously only the cover thumbnail). Click and double-click still work via PointerSensor activation distance (5 px).
- **Drop audio files on main view** to create new tracks: drop one or more `.wav`/`.mp3` files anywhere in the library section → auto-creates one track per file, attaches the audio with the matching role (`audio_tagged_wav`/`audio_tagged_mp3`), fires-and-forgets auto-analyze. Smart Source match: picks the Source whose `root_path` is a prefix of the file's absolute path, else falls through to the existing OutOfSourceDialog.

### Changed

- `DELETE /api/tracks/{id}` now soft-deletes (sets `deleted_at`). Existing callers see no contract change. New `?purge=true` query param triggers a true hard delete via `purge_track()`.
- `get_track()` still returns trashed tracks (so the editor can route to a trashed id and show a banner later); `list_tracks()` and `tracks_in_list()` filter them out by default.
- Source/List Pydantic models surface `position` as writable; pre-existing single-row PUT still works.

### Migration

- `008_track_trash.sql` adds `track.deleted_at TEXT NULL` with an index. Idempotent.

### Notes

- dnd-kit nested-context avoidance: a single `<DndContext>` (in `App.tsx`) hosts all drag types; `onDragEnd` routes by id prefix (`track:` / `source:` / `list:`). Track-to-list drop target renamed `list-drop:N` to avoid colliding with sortable id `list:N`.
- Always-`preventDefault` lesson from v0.0.13.2 re-applied to the new main-view drop zone.
- 29 smoke (+3 new), 3-run stable. 213 sidecar pytest, 204 vitest.

## [0.0.13.2] - 2026-05-17

### Fixed

- Audio drop zone now calls `preventDefault` on `dragover` so the browser no longer opens the dropped file in a new tab when the drop misses.
- Smoke harness gains negative-path coverage for the audio drop zone (asserts the page does not navigate away on a missed drop).

## [0.0.13.1] - 2026-05-17

### Fixed

- 6-item TrackEditor polish pass: tightened spacing, dialog copy, and `KeyPickerPopover` / `ChipMultiSelect` micro-interactions.
- Audio file rows accept native OS drag-drop (was click-only), matching the cover drop zone.
- Renderer `apiPost`/`apiPut` now surface server-side error `detail` in the thrown `ApiError`, so failed `/analyze` calls and similar routes show a meaningful message instead of a generic 500.

## [0.0.13] - 2026-05-17 — Audio Analysis (BPM + Key)

### Added

- librosa-based audio analysis pipeline (`audio_analysis/`): HPSS → percussive → `beat_track` for BPM; HPSS → harmonic → `chroma_cqt` → Krumhansl-Schmuckler correlation for Key.
- `POST /api/tracks/{id}/analyze` returns `{bpm, bpm_conf, key, key_conf}`; results cached by `(asset_id, sha256)` so a file is only analyzed once per content hash.
- Auto-fill on attach: when an audio file is attached and the track's BPM or Key is empty, analysis fires-and-forgets and writes the result only if confidence clears threshold (BPM ≥ 0.7, Key ≥ 0.6).
- Manual **Analyze audio** button in TrackEditor (Wand2 icon) opens `AnalyzeResultDialog` for per-field accept with a "Replace existing" toggle; low-confidence results display `⚠ Low` prefix.
- Smoke assertion 21: `/api/tracks/:id/analyze` response shape + duration sanity check against fixture WAV.

### Changed

- BPM detector uses `hop_length=256` (default `512` quantized to ~3 BPM steps near 120); fixture click track now detects 120.19 BPM.
- Major keys render with sharp notation, minor keys with flat notation, matching the existing Splice-style `KeyPickerPopover` convention.

### Migration

- `007_analysis_cache.sql` (auto-applied). Cache rows CASCADE on asset delete.

### Notes

- Sync API for MVP; expect 5–15s blocking on real 3-minute tracks (async upgrade deferred).
- Krumhansl-Schmuckler is weaker on modal/atonal hip-hop; BPM half/double-time errors common on heavy 808 trap (~10%). Both user-overridable via the per-field accept dialog.
- Smoke fixture is silence → analyze returns `bpm=0, conf=0`; only the API contract is validated, not algorithm quality.

## [0.0.12.2] - 2026-05-16

### Fixed

- `ChipMultiSelect` with `maxSelections=1` now renders as a single-select dropdown trigger (showing the current value) instead of an empty chip-bar with a `+` button.
- Multi-select chips render slightly larger for easier hit targets.

## [0.0.12.1] - 2026-05-16

### Added

- `maxSelections` prop on `ChipMultiSelect` — caps how many values can be picked, with the picker disabling additional options at the cap. Wired into TrackEditor where appropriate.

## [0.0.12] - 2026-05-16 — Multi-Value Tags + Native Drag-Out

### Architecture

- `producer`, `genre`, `mood` become **JSON arrays** stored in TEXT columns (not separate join tables). Singular values from prior versions migrated idempotently into single-element arrays.
- Filtering uses `EXISTS (SELECT 1 FROM json_each(...) WHERE value IN (?,?))` — "any match" within a field, AND across fields preserved.
- Sorting uses `json_extract($[0])` — first-element sort (acceptable trade-off for multi-value fields).
- Platform vocab mappings live in `packages/beatos-platforms/<platform>/{genre,mood}-map.json`; currently empty (identity) stubs, ready for publish-to-platform adapters in v0.1+.

### Added

- `ChipMultiSelect` component (Radix Popover) — reusable multi-value picker; Producer allows custom-add, Genre/Mood are vocab-only.
- `genres.ts` (74 entries) and `moods.ts` (50 entries, positive/neutral/negative groupings) renderer vocab files seeded from `conventions/vocab-genre-mood-scene.md`. English `en` is canonical stored key; Chinese `zh` is display-only.
- Native cover drag-out from TrackEditor's 200×200 cover: drag into Finder / another app and the underlying file is dragged. Backed by `webContents.startDrag` via a new `DRAG_OUT_FILE` IPC.
- `packages/beatos-platforms/` workspace package with stub genre/mood maps for future platform adapters.
- Smoke assertions 18–20: genre chip pick, producer custom-add round trip, cover drag-source attribute presence.

### Changed

- `/api/tracks` request/response widens `producer` / `genre` / `mood` to `list[str]`; renderer API types updated.
- TrackEditor swaps the three legacy single-value inputs for three `ChipMultiSelect` pickers.
- TrackDetailPanel renders multi-value genre/mood as comma-joined display.

### Migration

- `006_multi_value_tags.sql` (auto-applied). Backfills existing `producer`/`genre`/`mood` strings into single-element JSON arrays.

### Notes

- Drag-out intentionally limited to TrackEditor cover (not Library row covers) to avoid disturbing dnd-kit drop targets. Path validation rejects relative paths, traversal, missing files.
- Producer custom-add: typed in popover, persisted on Save; other tracks see the new producer in their picker's distinct list on next load (distinct endpoint pulls from `json_each`).
- BeatStars / Airbit platform vocab not yet researched — future work follows the same intake → `conventions/vocab-*` → platform-stub pattern used for NetEase.

## [0.0.11.3] - 2026-05-16

### Fixed

- VirtualTrackList scrollbar gutter alignment: outer scroll container reserved a 15px gutter on macOS "Show scroll bars: Always" mode, making rows narrower than `TableHeader` (which lives outside the scroll container). Applied `beatos-scroll` class to hide the gutter — same pattern used by `TrackDetailPanel`/`TrackEditor`/`SettingsPanel` since v0.0.11.1.
- Title column could not shrink below ~160px when resizing — lowered `MIN_WIDTH.title` from 160 → 80.

## [0.0.11.2] - 2026-05-16

### Fixed

- Library row columns still misaligned after v0.0.11.1: `TableHeader`'s flex container lacked the `gap-3` class that `TrackRow` had, producing ~120px cumulative drift across 10 children. Added matching `gap-3`.
- Column resizer was invisible (`w-1`, hover-only highlight) and drag direction felt inverted. Rewrote as 12px hit area with always-visible 1px inner line that highlights on hover/active.
- Play button now lives on the cover thumbnail: cover wrapper is `relative group w-12 h-12` containing `CoverImage` + `TrackRowPlayButton` with a dark scrim on row hover (or always when current track). Removed standalone play column from both `TrackRow` and `TableHeader`.
- `togglePlay` no-op'd when current track was in `error`/`idle` state — now retries via `loadAndPlay` so the row play button recovers the player after a failed load.

## [0.0.11.1] - 2026-05-16

### Added

- User-resizable column widths in the Library list via drag handles between adjacent columns (`useColumnWidthStore` + `<ColumnResizer>`). Session-scoped, not persisted.
- Unsaved-changes dialog in TrackEditor (`shallowEqualEditable` dirty tracking + `<UnsavedChangesDialog>` with Save / Discard / Cancel).

### Changed

- All Library columns left-aligned.
- Inner panels (`TrackDetailPanel`, `TrackEditor`, `SettingsPanel`) hide the macOS scrollbar gutter via a new `.beatos-scroll` CSS class.

### Fixed

- TrackEditor render crash exposed during smoke hardening: `useBlocker` from react-router-dom v6 requires a data router (`createHashRouter` + `<RouterProvider>`), but the app uses the component-based `<HashRouter>` API. Replaced `useBlocker` with manual `dialogOpen` state + `handleNavigateAway()` checks at each navigation exit (Cancel, ESC). Had been silently breaking the editor since the unsaved-changes work landed.

## [0.0.11] - 2026-05-16 — Library Table Redesign

### Added

- `/api/tracks` gains `sort_by`/`sort_dir`/per-field filter params (Producer, Genre, Mood, Key, BPM range, `has_audio`) plus new `/api/tracks/distinct/{field}` endpoint feeding the chip-bar pickers.
- `useTrackQueryStore` (renderer) drives sort + filter state and pushes updates to `useTrackStore.refresh()` via a single subscribe wire.
- Sortable `TableHeader` component — click toggles asc/desc, single active column, with direction indicator.
- Top filter chip bar (`FilterChipBar` + `FilterFieldPopover`) with `+ Add filter`; AND across fields, OR within a multi-value field. Sidebar Source/List remains primary filter; chips narrow further.
- `formatRowDate` + `formatChipLabel` formatters with unit tests.
- Two new smoke assertions: filter chip add/remove, sortable header round-trip.

### Changed

- TrackRow rebuilt as 2-line layout: title on top, Producer subtitle underneath; cover thumb bumped 40 → 48px; new Updated column showing absolute `YYYY-MM-DD` (chosen over hybrid/relative formats).
- `VirtualTrackList` `ROW_HEIGHT` 48 → 64 to accommodate the 2-line row.
- Default sort: `updated_at DESC` for library/source views; `list_track.position ASC` preserved for list views via a sentinel `sort_by=None` so the route can distinguish "client omitted sort_by" from "client passed sort_by=updated_at".

### Notes

- Radix has no nested popovers — `FilterChipBar` uses a single Popover with two views (`field-list` / field picker) controlled by local state.
- Sort field names whitelisted against `SORTABLE_FIELDS` / `DISTINCT_FIELDS` before f-string interpolation; values stay parameterized. No injection.
- Column widths and sort/filter state session-scoped — consistent with project no-persistence pattern (player state also session-only).

## [0.0.10] - 2026-05-16 — TrackEditor Refactor

### Added

- `KeyPicker` + `KeyPickerPopover` (Splice-style): Flat/Sharp tabs, note grid with alteration row above naturals, parallel Major/Minor buttons, Clear + Close. Replaces the plain `<input>` for `key_signature`.
- `CoverDropZone` 200×200 — noticeably larger than the previous aspect-square slot; cover thumbnail no longer disappears after import.
- Row-based audio file UI (`useAssetSlot` hook + `AudioFileRow` + `FileRowsSection`): full-width section with 5 rows (4 audio roles + Stems), each showing role label · filename · filesize · hover actions. Empty audio rows always render with "+ Add file" for discoverability.
- `formatBytes`, `parseKey`, `formatKey` helpers + unit tests.
- Radix Popover primitive (`components/ui/popover.tsx`).
- Smoke assertion 13: KeyPicker round-trip (open · pick · close · reopen).

### Changed

- TrackEditor switched to a 2-column grid: 200px cover on left, existing form fields (Title, BPM/Key/Genre, Mood/Producer/License, Tags, Description) on right, full-width file rows below.
- Editor max width bumped `max-w-3xl` → `max-w-4xl` for breathing room.
- `key_signature` storage still `TEXT`, but new values normalized on save to `"F# minor"` / `"Eb major"` format. Legacy values like `"F#m"` or `"Cmaj"` preserved until the user commits a fresh pick.
- Partial selections (note without mode) discarded on Close — no half-state ever reaches the DB. No default mode; Major or Minor must be picked explicitly.

### Removed

- `FilesSection` component + its test (superseded by `FileRowsSection`).

## [0.0.9.1] - 2026-05-16

### Fixed

- Resume-after-end playback: when a track played to natural end with repeat off, clicking play in the bottom bar flipped the icon but audio stayed silent and the progress bar froze. `BottomPlayerBar` now resets `audio.currentTime = 0` before `play()` when the element is `ended`.
- Smoke regression (assertion 12) added: wait 5s WAV to end, click play, assert `data-playing="true"` returns. 3-run stable.

## [0.0.9] - 2026-05-16 — Audio Playback

### Added

- Spotify-style bottom player bar with a singleton `<audio>` element managed by `usePlayerStore` (Zustand). Transport: Play/Pause/Prev/Next + Seek + Volume + Mute + Shuffle + Repeat.
- Role switcher in the player bar — pick between 4 audio variants (`tagged_wav`/`untagged_wav`/`tagged_mp3`/`untagged_mp3`). Default priority: `tagged_wav > untagged_wav > tagged_mp3 > untagged_mp3`. Role-switch replays from start.
- Per-track `producer` column (migration 005) + producer field in Track Editor. Player-bar subtitle renders `producer · BPM · Key` with em-dash placeholders for nulls.
- Queue = snapshot of visible view at play-start (All Beats / Source / List / Search results). Does NOT auto-update on navigation.
- `Track.has_audio` derived field via `_has_audio_subquery`, wired into `service.py`, `lists/membership.py`, AND `beatos_http` source-filter route. Track rows render a play button per row; rows with no audio show a disabled button with title "No audio asset".
- Sidecar route `GET /api/assets/audio/{id}` via FastAPI `FileResponse` (native HTTP Range support).
- `beatos-asset://audio/{asset_id}` custom protocol with Range header forwarding (mirrors existing `beatos-asset://cover/{asset_id}`).
- `audio-resolve.ts` resolver applying role-priority rule.

### Changed

- `AppShell` becomes flex-column with player bar as `flex-shrink-0` at bottom.
- Production CSP in `index.html` gains `media-src beatos-asset:` alongside existing `img-src beatos-asset:` — without this the built app silently failed to play audio (dev had a loosened CSP).

### Notes

- No persistence across restarts; no global Space shortcut (out of scope).
- 134 sidecar pytest / 85 vitest / 11 smoke (was 125 / 55 / 8).
- Stuck-at-end playback bug surfaced post-ship and fixed in v0.0.9.1.

## [0.0.8.1] - 2026-05-16

### Added

- Sidebar right-click context menu on Source and List rows: Rename (inline input; Enter commits, Escape cancels, blur commits) and Delete (confirm dialog built on `dialog.tsx` primitive).
- Settings "About" credit section: "Made by averatec0773" plus link buttons to `https://averatec.studio` and `https://github.com/averatec0773/beatos`. Buttons carry `aria-label` for screen readers.
- New IPC channel `SHELL_OPEN_EXTERNAL` with http(s)-only guard in the main handler; preload exposes `window.beatos.openExternal(url)`.

### Changed

- Splash window minimum display time 600ms → 1000ms, with a 250ms fade-out (`fadeOutAndClose`: 10 × 25ms `setOpacity` steps). Main window shows at fade start for a crossfade effect.
- `TopBar.tsx` `<header>` gains `WebkitAppRegion: "drag"`; all interactive children (BeatOS button, Settings, SearchInput wrapper) get `no-drag`. Fixes macOS dead-zone where `titleBarStyle: "hiddenInset"` only provided 78px draggable inset for traffic-light buttons.
- Source delete copy clarifies behaviour: "Your tracks and files stay where they are — only BeatOS's registration is removed." List delete copy: "The list is removed but member tracks stay in your library." Active-filter / active-list auto-reset after delete.

### Fixed

- Rename-on-blur inconsistency with "Add list" (which commits on blur): sidebar rename now also commits on blur via a `committedRef` guard.
- `DeleteSidebarItemDialog` was rendered inside a dead `renaming` branch — hoisted out.

## [0.0.8] - 2026-05-16 — Splash + Sidecar Fail-Fast

### Added

- Branded launch splash window: logo + "BeatOS" + "by averatec0773" + 3 pulsing dots on dark `#121212` with violet `#7c5cff` accent. 480×320 frameless transparent `BrowserWindow`, sandboxed, `hasShadow: true`. HTML inlined as `data:text/html` URL — no separate asset file, no dev/prod path divergence. Icon read from `resources/icon.png` (dev: `app.getAppPath()`; prod: `process.resourcesPath`) and inlined as base64 at boot.
- 600ms minimum display floor (`splashShownAt` refined to actual `ready-to-show` timestamp); splash closes on the main window's `ready-to-show` event, not a fixed timer. No splash on macOS dock-icon reopen.
- `--no-splash` CLI flag (first non-`--smoke` flag in main); used by smoke harness.
- `assertSidecarLayout(repoRoot, dirname)` — fail-fast `pyproject.toml` existence check before `spawn`. Replaces a 5s silent handshake hang with a clear error if electron-builder layout drifts. Lives in `apps/desktop/src/main/sidecar-helpers.ts`.
- Pure helpers `shouldShowSplash` + `closeDelayMs` unit-tested (6 tests in `splash.test.ts`); 2 unit tests for sidecar-layout assertion.

### Changed

- Smoke harness: all 5 hardcoded `waitForTimeout` sleeps replaced with Playwright `waitForSelector` (navigation-safe) for DOM checks and native Node `while`-loop polling for the API-membership check (avoids "Execution context was destroyed" after post-drag navigation). Drag-drop poll predicate tightened to `=== 1` (was `>= 1`).
- Smoke now cleans `userData` by default; `--keep-userdata` opt-in for debugging — no more `/tmp/beatos-smoke-*` accumulation.
- New smoke assertions: double-click on a track row opens the editor (`[data-track-editor]` selector); `app.windows().length === 1` immediately after `firstWindow()` verifies `--no-splash`.
- Honest current-state comment on MCP server (was a stale "full surface arrives in v0.0.5" promise).

### Fixed

- Graceful degradation when splash icon is missing: `createSplashWindow` returns null and warns instead of crashing boot.
- Sidecar bootstrap failure path: splash is closed + error dialog shown + app quits cleanly (no orphaned splash window).

### Removed

- Empty stub packages `packages/beatos-core/beatos_core/adapters/` and `packages/beatos-core/beatos_core/automation/` (both v0.0.2 stubs that never landed).

### Notes

- 115 sidecar pytest (unchanged) / 55 vitest (was 47: +2 sidecar-assert + 6 splash) / 8 smoke (was 7).
- 3 consecutive smoke runs PASS — predicate-based replacement of sleeps eliminated flakiness.

## [0.0.7] - 2026-05-16 — Cover Wiring + Audit Cleanup

### Added

- `Track.cover_asset_id` surfaced end-to-end. All Track SELECT queries (list, get, create+refetch, list-membership, source filter) gain a correlated subquery against `asset` (role='cover'). No schema change — `UNIQUE(track_id, role)` already enforces 1-to-1.
- Helper `_cover_subquery(prefix)` so callers control the outer alias.
- Smoke harness asserts `track.cover_asset_id` populated and `<img src="beatos-asset://cover/N">` actually renders in the row.
- Smoke harness gains structural drag-handle check: handle bbox width must be <50% of row width (catches `{...listeners}` slipping back onto the row body, the bug class from v0.0.6).
- Smoke `postJson` helper surfaces status + body for any failed seed call (was a `drag-drop assertion section error: ...` catch-all).

### Changed

- Frontend `TrackRow` reads `t.cover_asset_id` directly; the `coverIdFor` stub is gone.
- `TrackDetailPanel` placeholder copy: "No platforms wired yet (v0.0.4+)" → "No platforms wired yet."
- Drag handle now lives on the cover only; row body keeps a clean click + double-click surface.
- Smoke drag uses explicit mouse stepping on the cover handle — Playwright's `dragTo()` skips intermediate positions.
- MCP config drops `local-logs-mcp-server` from `.claude/settings.local.json` and the example; `npm run logs:tail` already covers it. `@robertn702/playwright-mcp-electron` stays.

### Fixed

- Malformed JSONL log lines in smoke assertions are now counted as failures (was silently dropped).
- Smoke `isVisible()` check before driving drag prevents flaky races.

### Removed

- `moveToManaged` purged across the chain: `move_managed.py` module, `/api/tracks/:id/assets/:id/move` route, frontend `assets.moveToManaged`, and `test_move_managed_returns_501`.
- Stale "phantom future work" docstring on `_on_new_file_in_source`.

### Notes

- 115 sidecar + 47 renderer + 7 smoke, all green.
- No `v0.0.7` git tag was cut originally; release commit is `f28790e` on `origin/main` (tag added 2026-05-17 during backfill).

## [0.0.6] - 2026-05-16 — Drag-Add Lists + Production-Bug Sweep

### Added

- **Drag-drop List membership** via `@dnd-kit/core` ^6.3.1 (chosen over HTML5 native because Playwright `_electron` cannot drive native drag). `DndContext` mounts at `App.tsx`; `DragOverlay` renders a ghost for single drag or a "N tracks" pill for multi.
- Drop targets are sidebar user-List rows only (All Beats and Sources reject drops).
- Multi-select state in `useTrackStore`: `selectedIds: Set<number>` + `anchorId` for range selection. Click modifiers: plain=replace, cmd/ctrl=toggle, shift=range from anchor. Dragging an unselected track switches selection to that one (Finder behavior).
- `EmptyState` component as discriminated union with three variants: `no-tracks`, `empty-list`, `no-search-results`. `TrackListPanel` picks the variant by route + search-query state.
- Smoke harness extended to drive the v0.0.6 drag flow end-to-end via `dragTo()` + API verification.

### Changed

- Accent `#7c5cff` (purple) is now docs-locked across `design-direction.md` — the `--accent: TBD` placeholder is gone.
- Docs sync across `CLAUDE.md`, `architecture.md`, `testing.md`, and `design-direction.md` to reflect v0.0.4.1–v0.0.6 reality.
- Backend: existing `POST /api/lists/:id/tracks` is idempotent via `INSERT OR IGNORE` — no new routes needed for multi-add.

### Fixed

The smoke harness drove the built renderer for the first time and surfaced four bugs that had been silently present since v0.0.1 / v0.0.4. Each would have been catastrophic for any production user:

- `BrowserRouter` on `file://` URLs matched no routes, so production builds rendered an empty React tree. Switched to `HashRouter`. Dev mode masked this because electron-vite served from `http://`.
- Sidecar CORS allow-list missed the `file://` origin (`Origin: null`) — renderer fetches threw `TypeError: Failed to fetch`. Replaced with `allow_origin_regex=r".*"` (safe: sidecar binds 127.0.0.1).
- Electron's `resolveDbPath()` ignored `process.env.BEATOS_DB_PATH`, so smoke harness DB isolation silently wrote into the user's real `~/Music/BeatOS/global.db`. Now honors caller env var first, then config, then default. (Same class as the v0.0.5 `BEATOS_LOG_PATH` fix.)
- `WelcomeScreen` was a dead-end if Sources appeared via a non-UI mechanism — never refreshed or redirected. Added a `useEffect` on mount to refresh sources, another on `all.length > 0` to navigate to `/`.
- Main process now parses `INFO:`/`WARNING:`/`ERROR:` prefixes from uvicorn stderr instead of tagging every line as an error.

### Notes

- Do not switch to HTML5 native drag — Playwright `_electron` cannot test it.
- Do not fall back to `BrowserRouter` in this Electron context.
- CORS regex stays open until we have a production threat model.

## [0.0.5] - 2026-05-15 — AI Dev Loop

### Architecture

- Introduces a self-verifiable dev loop so the agent can boot the app, drive UI, and read logs without user click+screenshot ping-pong. The agent's claim "I fixed it" can now be checked against the running binary before handing back.
- Builds on v0.0.4.1 foundations (stdio capture, crash broadcast, IPC constants, boot integration test).

### Added

- **Structured sidecar logging** via `structlog` + `asgi-correlation-id`: one JSON per line at `apps/desktop/logs/sidecar.jsonl`, including `level`, `ts`, `event`, `request_id`. Production writes to `~/Library/Logs/BeatOS/`.
- Main process passes `BEATOS_LOG_PATH` to the spawned sidecar in dev so logs land under `apps/desktop/logs/`.
- npm scripts (in `apps/desktop/`): `dev:fresh` (kill orphans, free 5000–5050, clear logs, then `npm run dev`); `smoke` (Playwright `_electron` against built app — run `npm run build` first; exits 2 if `out/main/index.js` missing, 1 on failure, 0 on pass; writes screenshot to `logs/smoke-<ts>.png`); `logs:tail` (human-friendly tail of both log files); `bash scripts/dev-reset.sh` (reset only).
- Playwright `_electron` smoke harness that boots the built app and asserts boot + absence of sidecar errors in JSONL.
- MCP server templates in `.claude/settings.local.json.example` (not auto-installed; user opts in by copying): `playwright-electron` (`@robertn702/playwright-mcp-electron`) to drive the running app; `local-logs` (`local-logs-mcp-server`) to tail JSONL.
- Tests: `test_logging_config.py` (2 tests on JSONL output + idempotency) plus extension to `test_boot_integration.py` asserting JSONL output from real subprocess.

### Changed

- `tsconfig.web` gains `vitest/globals` so test files typecheck under `npm run build`.
- `.gitignore` excludes TypeScript composite `tsbuildinfo` artifacts.
- `CLAUDE.md` stack note bumped to Electron 39 + Radix UI + `structlog`; clarifies Playwright is `_electron`, not CDP.

### Fixed

- Main honors `BEATOS_LOG_PATH` from caller env instead of overriding (needed for smoke harness and tests).

### Notes

- Standard agent loop is now: `npm run dev:fresh` (background) → edit code (electron-vite restarts main, uvicorn `--reload` restarts sidecar) → read `logs/sidecar.jsonl` for errors → use `playwright-electron.browser_snapshot` to verify renderer UI → on milestone, `npm run smoke`.

## [0.0.4.1] - 2026-05-15

### Added

- Electron main captures sidecar stdio + `electron-log` to `apps/desktop/logs/main.log`; sidecar stderr tagged `[sidecar]`. Adds `electron-log` 5.x dependency.
- IPC channel string literals extracted to a shared constants module (`src/shared/ipc-channels.ts`).
- `sources.loadError` flag distinguishes API failure from "no sources" — drives `<ApiErrorState>` vs the `/welcome` route.
- Sidecar crash broadcast to renderer; `cachedBase` invalidated on network error so the renderer reconnects cleanly after a sidecar restart.
- Boot integration test (`test_boot_integration.py`) spawning a real sidecar subprocess and asserting handshake + `/api/health`.

### Fixed

- `resolvePathFn` requires a `PathVariables` arg per electron-log types (caught at typecheck after the electron-log integration).

### Notes

- Previously rolled into v0.0.5; split out 2026-05-17 (during backfill) to match the actual `v0.0.4.1` tag scope. v0.0.5 (same-day ship) layers structured JSONL logging, smoke harness, and dev scripts on top of these foundations.

## [0.0.4] - 2026-05-15 — Multi-Source Unification

### Architecture

- Pivoted from per-library OS mount-point model to Steam-style unified catalog.
- "Library" terminology replaced by **Source** in UI and schema.
- Tracks are global; Source affiliation is derived at query time from `asset.abs_path` prefix-matching against `source.root_path`.
- Lists, search, filters, and metadata edits all span Sources.

### Added

- `/api/sources` CRUD + per-Source status endpoint.
- `SourceStatusMonitor` polling daemon (5s default; emits transitions).
- `WatcherRegistry` running one `watchdog` observer per online Source.
- `OutOfSourceDialog` (Copy / Move / Add as Source) when a picked file lies outside every registered Source — backend returns structured 422.
- Four audio role variants (`audio_tagged_mp3`, `audio_untagged_mp3`, `audio_tagged_wav`, `audio_untagged_wav`) plus `cover` and `stems` for a 6-slot grid in the Track Editor.
- `BEATOS_DB_PATH` env var; default `~/Music/BeatOS/global.db`.
- Settings → Storage section (DB path override) + Sources section.
- New IPC: `storage:get-db-path`, `storage:set-db-path`, `storage:pick-folder`, `fs:copy-into-source`, `fs:move-into-source`.

### Changed

- `/api/tracks` accepts `?source_id=<id>` filter.
- `/api/tracks/:id/assets` accepts `?replace=true` for atomic DELETE+INSERT (fixes cover-attach 409 when slot is occupied).
- Renderer `apiPost`/`apiGet`/etc. throw a typed `ApiError` carrying `status` and `body` so callers can introspect structured server errors.
- Sidebar: SOURCES + LISTS two-section layout; single-select Source filter with synthetic "All Beats" row aggregating track counts.
- `AppShell` uses `h-screen` so only the editor scrolls (carry-on #1).
- TopBar: brand + route title + global Search + Settings icon — no more back/forward nav, no version badge.
- Welcome: "Add your first Source" framing.
- Charter §6 rewritten (Sources, not Libraries); §18 rule 9 gained a v0.0.4 exception note (one-time schema reset).

### Removed

- `/api/library/*` and `/api/watch-folders/*` endpoints.
- `beatos_core.library` Python module; `state.require_active`; library service.
- `useLibraryStore`, `LibrarySidebar`, `LibrarySwitcher`, `useWatcherStore`, `FirstScanModal`, `WatchFolderRow`, `OnboardingDriver`.
- Dead fields: `track.library_id`, `track.platform_data`, `list.library_id`.

### Migration

- v0.0.3 was never publicly released — no migration path provided.
- v0.0.4 is a one-time schema reset; append-only rule resumes after.
- If you have a `~/Library/Application Support/BeatOS/` registry from a dev build, delete it; BeatOS now reads `~/Music/BeatOS/global.db` by default.

## [0.0.3] - 2026-05-14

### Added

- **Asset attachment**: track editor gains a Files section with three slots (Audio / Stems / Cover). Audio attaches auto-fill the track's BPM if it was empty. Linked mode by default — files stay where they live on disk.
- **Watch folder daemon**: opt-in via Settings; on adding a folder, BeatOS scans it once and prompts to import existing files; afterwards, any new audio file dropped into the folder becomes a draft track automatically.
- **Missing-file recovery**: a startup sweep + periodic check marks moved or deleted files as `missing`. Clicking "Find file" silently re-links when the new file's sha256 matches the stored hash.
- **User-created lists**: `list` + `track_list` tables. Sidebar surfaces All Beats (system) + user Lists + Beattapes. Right-click a track to add it to any user list.
- **Welcome screen**: first launch (or stale library path) shows a proper welcome with "Choose Library Folder" + "Use default (~/BeatOS)" buttons. No more naked folder dialog on launch.
- **Library quick switcher**: dropdown from the sidebar's "Library" title swaps the active library without leaving Settings.
- **List virtualization** via @tanstack/react-virtual — smooth scrolling at 500+ tracks.
- **Search**: Cmd+F focuses a search input filtering title / tags / genre client-side.
- **Right-click context menu** on track rows: Edit · Add to list ▸ · Reveal in Finder · Delete (with inline confirm).
- **Hover-delete icon** on track rows for fast clean-up.
- **Cover art**: right panel renders 320×320 (when set); track rows show 40×40 thumbnails. Loaded via a new `beatos-asset://` custom Electron protocol so the renderer can display local files securely.
- **Track creation flow**: clicking + Add Track now opens an EMPTY editor at `/tracks/new`; no DB row is created until you click Save. ESC discards cleanly.
- **TopBar route title** shows the current route (All Beats / Editor / Settings / list name).

### Changed

- Asset `mode` value: future inserts use `'linked'` instead of the old inline-comment value `'referenced'`. Schema column itself didn't change (no migration needed).
- `init_library_root` expands `~` so `~/BeatOS` works as a library path.
- The `migrations/` directory grew to two files. Runner already applies new migrations on startup; nothing else changes.

### Notes

- **Managed Move** (the "Move into BeatOS library" action that destructively moves files into the library root): schema supports it; HTTP endpoint returns 501; UI shows a disabled menu item. Real implementation lands in v0.0.4.
- **BeatStars / Airbit injection** is no longer planned for v1.0. The v0.0.4 milestone will be reshuffled in a separate charter session.
- Charter §15 v0.0.3 language clarified: Linked (default) vs Managed (Move into BeatOS library; v0.0.4).

## [0.0.2] - 2026-05-14

### Added

- Library lifecycle: create / list / switch via Settings page; first-launch onboarding picks a library folder (existing `.beatos/db.sqlite` silently re-opened).
- Track CRUD: create / read / update / delete, exposed at `/api/tracks`; renderer surfaces editor at `/tracks/:id/edit` (full-route).
- 3-column Spotify-pattern shell: left "Library" sidebar (All Beats + Settings + + New library), middle track list, right Now-Focused detail panel.
- Top bar with macOS traffic-light inset (`titleBarStyle: 'hiddenInset'`) and history nav.
- Accent color finalized: `#7c5cff` violet (replaced v0.0.1 placeholder green).
- Cross-library registry at `<userData>/known_libraries.json` (`BEATOS_REGISTRY_PATH` overridable); identification by `root_path` globally.
- Configuration persistence at `<userData>/config.json` records `lastLibraryPath` for auto-mount on subsequent launches.
- Frontend test infrastructure (Vitest + React Testing Library + jsdom) with 8 component tests.
- `extra='forbid'` on TrackUpdate model: PUT /api/tracks/:id with `description_draft` returns 422 (sacred-field protection at HTTP boundary).

### Changed

- `beatos-http` v0.0.1 → v0.0.2; FastAPI app mounts library and track routers.
- BrowserWindow size 1200×800 → 1280×800; minimum BrowserWindow background `#121212` (no flash before first paint).

### Notes

Out of scope (deferred to v0.0.3+): audio file picker, watch folders, user-created lists, search, drag-drop, AI features.

## [0.0.1] - 2026-05-14

### Added

- Initial walking skeleton: Electron + React + Vite + Tailwind + shadcn renderer; Python 3.11 sidecar with FastAPI `/api/health`; MCP server with `ping` tool.
- Three-package Python workspace (`beatos-core`, `beatos-http`, `beatos-mcp`) under `uv`.
- SQLite schema migration `001_init.sql` (library / track / asset / watch_folder / settings / schema_version).
- Design tokens (Spotify-dark palette) seeded into the renderer; Inter + JetBrains Mono fonts.
- Repository harness (CLAUDE.md, AGENTS.md, conventions) customized from `averatec/averatec-harness-template`.

### Notes

This release is structural only — no end-user features yet.
