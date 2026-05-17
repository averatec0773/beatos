# Architecture

Code-level architecture for AI agents touching files in this repo. Product context first, then layering rules, directory map, per-version capability tables, and the MCP surface plan. For pending work see [ROADMAP.md](../ROADMAP.md); for shipped history see [CHANGELOG.md](../CHANGELOG.md).

## Vision

BeatOS is a local-first desktop app for beat producers — catalog beats and their assets, publish to multiple platforms via browser automation, expose the library to AI agents over MCP. Single-user, no server, no telemetry. Target user: indie beat-makers with 50-500 beats selling on 2+ platforms (BeatStars, Airbit, NetEase).

## Glossary

| Term | Meaning |
|---|---|
| **Track** | A beat record with metadata + 0+ assets. Globally unique; not owned by any Source. |
| **Asset** | File attached to a Track via `role` (`audio_tagged_wav`, `audio_untagged_mp3`, `cover`, `stems`). |
| **Source** | Registered folder on disk that BeatOS watches. Source affiliation is computed at runtime by matching asset `abs_path` against Source `root_path`. |
| **List** | User-curated playlist; membership preserved across soft-delete / restore. |
| **Adapter** | Platform-specific browser-automation class (`inject(page, track_data)`). Not yet implemented (v0.1.0 candidate). |
| **Inject** | User action: run adapter against open browser page. Code fills the form, user submits. Never auto-submit. |
| **Sidecar** | The Python backend (`packages/beatos-*`), launched as child process by Electron main. |
| **MCP** | Model Context Protocol — AI-agent stdio facade. Mirrors HTTP reads; writes require two-phase `confirm_*` commit. |

## Data model: Sources, not Libraries

Tracks are global — they belong to BeatOS as a whole, not to any Source. Source affiliation is derived at runtime by path-prefix matching. A Source going offline (drive unplugged) does NOT remove its tracks; they become read-only for file ops, fully editable for metadata. Lists / search / filter span all Sources. Settled in v0.0.4 after the per-Source mount-point model was rejected.

## Layering rules

1. `packages/beatos-core/` is pure Python business logic. No imports from `fastapi`, `mcp`, or Electron-side files. Allowed deps: stdlib, `aiosqlite`, `pydantic`, `playwright`, `mutagen`, `watchdog`.
2. `packages/beatos-http/` and `packages/beatos-mcp/` are thin facades. Each route / tool is a few lines that calls into `beatos-core` and shapes the response.
3. `apps/desktop/electron/` (main + preload) is also thin. It spawns the Python sidecar, creates `BrowserWindow`, exposes native dialogs / tray / shortcuts via IPC. Business logic lives in `beatos-core`.
4. The renderer (`apps/desktop/src/`) talks to `beatos-http` over `http://127.0.0.1:<port>`. Port is ephemeral, written by the sidecar to a JSON handshake file, exposed to the renderer via `contextBridge` in `preload.ts`.

## Directory map

```
apps/desktop/
  electron/                  ← main process (Node) — spawns sidecar, IPC
    main.ts                  ← entrypoint, sidecar lifecycle
    preload.ts               ← contextBridge surface
  src/                       ← React renderer
    App.tsx                  ← top-level route shell
    api/                     ← typed fetch client against beatos-http
    components/ui/           ← shadcn primitives
    features/                ← one folder per domain feature (library, tracks, inject, settings)
    stores/                  ← Zustand stores
    lib/                     ← cross-feature helpers
  resources/sidecar/         ← PyInstaller artifacts (populated in v0.0.7)
  logs/                      ← electron-log main.log + structlog sidecar.jsonl (gitignored)
  scripts/
    dev-reset.sh             ← kill orphan uvicorn / free ports / clear logs
    smoke.mjs                ← Playwright _electron smoke harness
  electron.vite.config.ts    ← electron-vite config
  electron-builder.yml       ← packaging config

packages/beatos-core/        ← business logic
  beatos_core/
    db.py                    ← aiosqlite + migration runner
    migrations/              ← versioned .sql files (append-only)
    models/                  ← Pydantic models (one file per entity)
    library/                 ← library lifecycle service
    tracks/                  ← track CRUD + queries
    assets/                  ← reference / managed mode, relocate
    sources/                 ← v0.0.4 source registry + status monitor
    lists/                   ← user-list CRUD + membership
    watcher/                 ← watchdog registry (per-source observer)
    audio_analysis/          ← v0.0.13 librosa BPM + Key pipeline

packages/beatos-http/        ← FastAPI facade for the renderer
  beatos_http/
    app.py                   ← FastAPI() with CORS, routes mounted
    handshake.py             ← write/read port handshake JSON
    routes/                  ← one router per resource group
    __main__.py              ← uvicorn entry

packages/beatos-mcp/         ← MCP stdio facade for AI agents
  beatos_mcp/
    server.py                ← tool registration
    tools/                   ← one module per tool group
    __main__.py              ← stdio MCP server entry

packages/beatos-platforms/   ← v0.0.12 per-platform vocab maps
  <platform>/                ← e.g. netease/ — {genre,mood}-map.json stubs
```

## Key components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Migration runner | `packages/beatos-core/beatos_core/db.py` | Reads `migrations/*.sql` and applies any not in `schema_version`. Append-only — never edit an applied migration. |
| Handshake writer | `packages/beatos-http/beatos_http/handshake.py` | Writes `{"port": <int>, "started_at": <iso>}` to a known path on startup, before uvicorn accepts connections. |
| Handshake reader | `apps/desktop/electron/main.ts` | Polls the handshake file with a 5s timeout, then creates the `BrowserWindow`. |
| Adapter registry | `packages/beatos-core/beatos_core/adapters/registry.py` | Maps platform name → adapter class. New platforms slot in here. |
| Audio analysis cache | `packages/beatos-core/beatos_core/audio_analysis/service.py` + migration `007` | librosa BPM+Key pipeline; results keyed by `(asset_id, sha256)` so a file is analyzed once per content hash. |
| Player store | `apps/desktop/src/renderer/src/stores/player.ts` | Zustand singleton managing the lone `<audio>` element; transport + queue + role state. |
| Role-priority resolver | `apps/desktop/src/renderer/src/lib/audio-resolve.ts` | Picks an audio asset from a track using `tagged_wav > untagged_wav > tagged_mp3 > untagged_mp3`. |
| Filter chip bar | `apps/desktop/src/renderer/src/components/FilterChipBar.tsx` + `stores/track-query.ts` | Drives `/api/tracks` `sort_by`/`sort_dir`/filter params; AND across fields, OR within a field. |

## Handshake file location

```
$XDG_RUNTIME_DIR/beatos/handshake.json                       (Linux, if XDG_RUNTIME_DIR set)
~/Library/Application Support/BeatOS/runtime/handshake.json   (macOS)
%APPDATA%\BeatOS\runtime\handshake.json                       (Windows)
```

In Electron main, derive from `app.getPath('userData') + '/runtime/handshake.json'`. The Python side reads `BEATOS_HANDSHAKE_PATH` env var (set by Electron main) and falls back to a platform-default if unset (useful when running the sidecar standalone for tests).

## v0.0.4.1 + v0.0.5 — Dev Loop Additions

| Capability | Location | Purpose |
|---|---|---|
| Sidecar stdio capture | `apps/desktop/src/main/index.ts` (pipe + readline) | sidecar stderr/stdout tagged `[sidecar]` and routed to electron-log |
| electron-log file sink | `apps/desktop/src/main/logger.ts` | dev: `apps/desktop/logs/main.log`; prod: `~/Library/Logs/BeatOS/main.log` |
| Sidecar crash IPC | `main/index.ts:sidecar.on('exit')` → `IPC_CHANNELS.SIDECAR_CRASHED` | renderer shows toast + `api/client.ts` invalidates `cachedBase` |
| `sources.loadError` | `stores/sources.ts` | distinguishes API failure from "no sources" — drives `<ApiErrorState>` vs `/welcome` |
| IPC channel constants | `src/shared/ipc-channels.ts` | typed, single source of truth for main + preload |
| structlog + correlation IDs | `packages/beatos-http/beatos_http/logging_config.py` + `app.py` middleware | one JSON per line at `BEATOS_LOG_PATH` (default `apps/desktop/logs/sidecar.jsonl`), every line includes `request_id` |
| Boot integration test | `packages/beatos-http/tests/test_boot_integration.py` | spawns real subprocess, asserts handshake + `/api/health` + JSONL output |
| `BEATOS_LOG_PATH` env contract | passed by Electron main, honored by sidecar `logging_config._default_log_path()` | callers (smoke harness, tests) can redirect by setting env var; Electron defers to existing value |
| Smoke harness | `apps/desktop/scripts/smoke.mjs` | Playwright `_electron`: launches built app, asserts boot + zero ERROR-level JSONL lines |
| Dev reset | `apps/desktop/scripts/dev-reset.sh` | kills orphan uvicorn, frees 5000-5050, clears logs |
| npm scripts | `dev:fresh`, `smoke`, `logs:tail` | agent-runnable verification — see `memory/feedback_run_the_tools_you_built.md` |

## v0.0.6 → v0.0.13 Structural Additions

### v0.0.6 — Drag-Add Lists + Production-Bug Sweep

| Capability | Location | Purpose |
|---|---|---|
| `@dnd-kit/core` drag layer | `apps/desktop/src/renderer/src/App.tsx` (`DndContext` + `DragOverlay`) | Drives sidebar drag-add; chosen over HTML5 native because Playwright `_electron` cannot drive native drag. |
| Multi-select state | `stores/tracks.ts` (`selectedIds: Set<number>` + `anchorId`) | Click modifiers: plain=replace, cmd/ctrl=toggle, shift=range from anchor. |
| `EmptyState` discriminated union | `components/EmptyState.tsx` | Variants: `no-tracks` / `empty-list` / `no-search-results`; chosen by route + search state. |
| HashRouter (not BrowserRouter) | `App.tsx` | `file://` URLs match no routes under BrowserRouter — production rendered empty until smoke caught it. Never revert. |
| CORS open regex | `packages/beatos-http/beatos_http/app.py` (`allow_origin_regex=r".*"`) | `file://` origin is `null`; allow-lists miss it. Safe: sidecar binds `127.0.0.1`. |
| `BEATOS_DB_PATH` env contract | `apps/desktop/src/main/config.ts` (`resolveDbPath`) | Caller env wins, then config, then default. Same shape as `BEATOS_LOG_PATH`. |
| Sidecar log-level prefix parser | `apps/desktop/src/main/log-parse.ts` | Maps `INFO:` / `WARNING:` / `ERROR:` uvicorn stderr prefixes to electron-log levels. |

### v0.0.7 — Cover Wiring + Audit Cleanup

| Capability | Location | Purpose |
|---|---|---|
| `_cover_subquery(prefix)` | `packages/beatos-core/beatos_core/tracks/service.py` | Correlated subquery against `asset` (role='cover'); injected into every Track SELECT (list, get, source filter, list membership). Caller controls the outer alias. |
| `Track.cover_asset_id` field | `packages/beatos-core/beatos_core/models/track.py` | Derived (no schema change — `UNIQUE(track_id, role)` already enforces 1-to-1). |
| Smoke `postJson` helper | `apps/desktop/scripts/smoke.mjs` | Surfaces status + body for failed seed calls (was a catch-all). |
| Drag handle on cover only | `components/TrackRow` cover wrapper | Keeps row body clean for click + double-click. |

### v0.0.8 — Splash + Sidecar Fail-Fast

| Capability | Location | Purpose |
|---|---|---|
| `assertSidecarLayout(repoRoot, dirname)` | `apps/desktop/src/main/sidecar-helpers.ts` | Fail-fast `pyproject.toml` existence check before `spawn`; replaces 5s silent handshake hang if electron-builder layout drifts. |
| Splash window | `apps/desktop/src/main/splash.ts` (pure helpers `shouldShowSplash` + `closeDelayMs` unit-tested) | 480×320 frameless transparent; HTML inlined as `data:` URL (no dev/prod path divergence). 1s min display + 250ms fade. |
| `--no-splash` CLI flag | `main/index.ts` argv parse | Smoke harness opts out; asserts `app.windows().length === 1`. |
| Smoke clean-userData default | `scripts/smoke.mjs` | `--keep-userdata` opt-in; no more `/tmp/beatos-smoke-*` accumulation. |

### v0.0.9 — Audio Playback

| Capability | Location | Purpose |
|---|---|---|
| Role-priority resolver | `lib/audio-resolve.ts` | `tagged_wav > untagged_wav > tagged_mp3 > untagged_mp3`. |
| `usePlayerStore` singleton | `stores/player.ts` | One `<audio>` element; transport + queue + shuffle + repeat + role state. |
| Bottom player UI | `components/BottomPlayerBar.tsx` + `RoleSwitcher.tsx` + `TrackRowPlayButton` (in `TrackRow`) | Spotify-style bar; per-row play button driven off `has_audio`. |
| Audio HTTP route | `packages/beatos-http/beatos_http/routes/assets.py` (`GET /api/assets/audio/{id}`) | `FileResponse` for native HTTP Range. |
| `beatos-asset://audio/{id}` | `apps/desktop/src/main/asset-protocol.ts` | Mirrors existing `cover/{id}` protocol; forwards Range header. |
| `Track.has_audio` derived | `tracks/service.py` `_has_audio_subquery` | Wired into `service.py`, `lists/membership.py`, source-filter route. |
| CSP `media-src beatos-asset:` | `apps/desktop/src/renderer/index.html` | Required in production CSP — dev CSP is loosened, silently masked the gap. |
| Migration 005 `track.producer` | `migrations/005_track_producer.sql` | Per-track producer column; player-bar subtitle `producer · BPM · Key`. |

### v0.0.10 — TrackEditor Refactor

| Capability | Location | Purpose |
|---|---|---|
| `KeyPicker` + `KeyPickerPopover` | `components/KeyPicker.tsx` + `KeyPickerPopover.tsx` | Splice-style Flat/Sharp tabs + note grid + parallel Major/Minor. Stored value normalized to `"F# minor"` / `"Eb major"`. |
| Radix Popover primitive | `components/ui/popover.tsx` | Shared primitive (used by KeyPicker, ChipMultiSelect, FilterChipBar). |
| `useAssetSlot` hook | `hooks/useAssetSlot.ts` | Slot-state abstraction backing the file-row UI. |
| Row-based files UI | `components/AudioFileRow.tsx` + `FileRowsSection.tsx` | 5 full-width rows (4 audio roles + Stems); empty rows render "+ Add file". |
| Format helpers | `lib/format-bytes.ts` + `lib/parse-key.ts` (`parseKey` / `formatKey`) | Unit-tested; key parse handles legacy `"F#m"` / `"Cmaj"` until next save. |

### v0.0.11 — Library Table Redesign

| Capability | Location | Purpose |
|---|---|---|
| `/api/tracks` sort + filter | `packages/beatos-http/beatos_http/routes/tracks.py` | `sort_by` / `sort_dir` / per-field filters (Producer, Genre, Mood, Key, BPM range, `has_audio`). |
| `/api/tracks/distinct/{field}` | `routes/tracks.py` + `renderer/api/distinct.ts` | Powers chip-bar filter pickers. |
| `SORTABLE_FIELDS` / `DISTINCT_FIELDS` whitelists | `routes/tracks.py` | Whitelist before f-string interpolation; values stay parameterized. SQL-injection guard. |
| `useTrackQueryStore` | `stores/track-query.ts` | Sort + filter state; subscribes to `useTrackStore.refresh()`. |
| `FilterChipBar` + `FilterFieldPopover` | `components/FilterChipBar.tsx` + `FilterFieldPopover.tsx` | Single Popover with two views (`field-list` / field picker) — Radix has no nested popovers. |
| Sortable `TableHeader` | `components/TableHeader.tsx` | Click toggles asc/desc; single active column. |

### v0.0.11.1 — Resizable Cols + Unsaved Dialog

| Capability | Location | Purpose |
|---|---|---|
| `useColumnWidthStore` + `<ColumnResizer>` | `stores/column-widths.ts` + `components/ColumnResizer.tsx` | Session-scoped column widths; drag handles between columns. |
| `UnsavedChangesDialog` + `shallowEqualEditable` | `components/UnsavedChangesDialog.tsx` + `lib/shallow-equal-track.ts` | TrackEditor dirty tracking; Save / Discard / Cancel. |
| `.beatos-scroll` CSS class | renderer global CSS | Hides macOS scrollbar gutter on inner panels (TrackDetailPanel / TrackEditor / SettingsPanel / VirtualTrackList). |
| Manual `dialogOpen` state | `TrackEditor.tsx` | Replaces react-router `useBlocker` — incompatible with component-based `<HashRouter>` (needs data router). Crashed editor on render. Never reintroduce `useBlocker` here. |

### v0.0.12 — Multi-Value Tags + Native Drag-Out

| Capability | Location | Purpose |
|---|---|---|
| `ChipMultiSelect` | `components/ChipMultiSelect.tsx` (Radix Popover) | Reusable multi-value picker; Producer allows custom-add, Genre/Mood are vocab-only. `maxSelections=1` renders as a single-select dropdown. |
| JSON-array TEXT columns | `migrations/006_multi_value_fields.sql` | `producer` / `genre` / `mood` migrated idempotently into single-element arrays. |
| Multi-value filtering | `tracks/service.py` | `EXISTS (SELECT 1 FROM json_each(...) WHERE value IN (?,?))` — "any match" within field, AND across fields. |
| Multi-value sorting | `tracks/service.py` | `json_extract($[0])` — first-element sort. |
| Renderer vocab | `data/genres.ts` (74) + `data/moods.ts` (50) | English `en` is canonical stored key; `zh` is display-only. |
| Platform vocab maps | `packages/beatos-platforms/<platform>/{genre,mood}-map.json` | Identity stubs; ready for publish-to-platform adapters in v0.1+. |
| Native cover drag-out | `main/index.ts` `DRAG_OUT_FILE` IPC → `webContents.startDrag` | Drag TrackEditor 200×200 cover into Finder / other apps. Path validation rejects relative + traversal + missing files. |

### v0.0.13 — Audio Analysis (BPM + Key)

| Capability | Location | Purpose |
|---|---|---|
| Audio analysis pipeline | `packages/beatos-core/beatos_core/audio_analysis/` (`bpm.py`, `key.py`, `pipeline.py`, `service.py`, `models.py`) | HPSS → percussive → `beat_track` for BPM (hop_length=256); HPSS → harmonic → `chroma_cqt` → Krumhansl-Schmuckler for Key. librosa dep. |
| `POST /api/tracks/{id}/analyze` | `packages/beatos-http/beatos_http/routes/analysis.py` | Returns `{bpm, bpm_conf, key, key_conf}`; sync API (5–15s on real tracks). |
| `analysis_cache` table | `migrations/007_analysis_cache.sql` | Keyed by `(asset_id, sha256)`; CASCADE on asset delete. One analysis per content hash. |
| Renderer API client | `renderer/api/analysis.ts` + `lib/audio-analysis-constants.ts` | Confidence thresholds (BPM ≥ 0.7, Key ≥ 0.6) live in constants module. |
| Fire-and-forget auto-fill | `lib/auto-analyze.ts` (`maybeAutoAnalyze`) called from `stores/assets.ts` `attach` | Only writes BPM/Key when the field is empty AND confidence clears threshold. |
| `AnalyzeResultDialog` + Wand2 button | `components/AnalyzeResultDialog.tsx` + TrackEditor toolbar | Per-field accept dialog with "Replace existing" toggle; `⚠ Low` prefix on sub-threshold results. |

### v0.0.14 — Drag-and-Trash

| Capability | Location | Purpose |
|---|---|---|
| Soft-delete | `migrations/008_track_trash.sql` adds `track.deleted_at TEXT NULL` + index | `delete_track()` repurposed to set `deleted_at`. `purge_track()` is the true hard-delete. `get_track()` does NOT filter trashed (editor can still load); `list_tracks()` and `tracks_in_list()` filter `deleted_at IS NULL`. |
| Trash endpoints | `routes/tracks.py` | `DELETE /api/tracks/{id}` (soft) · `?purge=true` (hard) · `POST .../restore` · `GET /api/tracks/trash`. Route order matters: `/trash` registered before `/{track_id}` so the literal wins. |
| Trash UI | `routes/TrashPanel.tsx` + `stores/trash.ts` + `SidebarPanel.tsx` TRASH section | Independent section in sidebar with live count; row-level Restore + Delete forever (confirm). list_track membership preserved across delete/restore. |
| Bulk reorder | `service.py::reorder_sources/lists` + `routes/sources.py / lists.py` | `POST /api/sources/reorder {ids: []}` and same for lists. Atomic single-transaction position assignment 0..N-1. |
| Sidebar drag-reorder | `routes/SidebarPanel.tsx` `SortableSourceRow` / `SortableListRow` via `@dnd-kit/sortable` | System list "All Beats" (`kind='system'`) excluded from sortable. Track→list droppable id renamed `list-drop:N` to avoid colliding with sortable id `list:N`. |
| Whole-row drag handle | `components/TrackRow.tsx` | dnd-kit `{listeners, attributes}` moved from cover wrapper to row root. PointerSensor activation distance 5px prevents accidental drags on click/dblclick. |
| Drop-to-create-track | `lib/create-track-from-file.ts` + `routes/TrackListPanel.tsx` drop zone | Drop `.wav`/`.mp3` anywhere on library → one track per file with smart Source path match (file under Source root). attach failure rolls back the orphan track. Always-`preventDefault` on `dragover` (lesson reinforced from v0.0.13.2). |
| Single DndContext, multi-type routing | `App.tsx` `onDragEnd` switches on id prefix | `track:` / `source:` / `list:` prefixes route to add-to-list / source-reorder / list-reorder respectively. Avoids nested DndContexts. |

## MCP surface (aspirational)

`packages/beatos-mcp/` currently only exposes `ping`. The planned surface (any read tool mirrors an existing HTTP route; any write tool requires two-phase commit):

| Tool | Type | Notes |
|---|---|---|
| `list_tracks(filter?)` / `get_track(id)` / `search_tracks(query)` | read | Mirror `/api/tracks*`. |
| `list_platforms()` | read | Once adapters exist. |
| `inject_to_platform(track_id, platform)` | write | Returns `confirm_token`; agent must call `confirm_inject(token)` separately. |
| `draft_description(track_id)` | write | Writes to `description_draft` only — never to user's `description`. v0.2 RAG-ready. |
| `suggest_tags(track_id)` / `find_similar(track_id)` | read | v0.2 / v0.3 (audio + text RAG). |

Trust boundary = local stdio process; no network auth needed. See [ROADMAP.md](../ROADMAP.md) for the build sequence.

## What NOT to change without reading context first

- `migrations/001_init.sql` — never modify after applied; add `002_*.sql` and forward.
- `track.description` column — sacred (user-authored); AI output goes to `description_draft` only.
- The two-phase commit pattern on MCP write tools — non-negotiable.
- The Electron main / renderer separation — never `nodeIntegration: true` in `BrowserWindow`; always go through `preload.ts` contextBridge.
