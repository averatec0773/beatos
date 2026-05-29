# Architecture

Code-level architecture for AI agents touching files in this repo. Product context first, then layering rules, directory map, per-version capability tables, and the MCP surface plan. For pending work see [ROADMAP.md](../ROADMAP.md); for shipped history see [CHANGELOG.md](../CHANGELOG.md).

## Vision

BeatOS is a local-first desktop app for beat producers — catalog beats and their assets, publish to multiple platforms via browser automation, expose the library to AI agents over MCP. Single-user, no server, no telemetry. Target user: indie beat-makers with 50-500 beats selling on 2+ platforms (BeatStars, Airbit, NetEase).

## Glossary

| Term | Meaning |
|---|---|
| **Track** | Beat record with metadata + 0+ assets; globally unique. |
| **Asset** | File attached to a Track via `role` (`audio_tagged_wav`, `audio_untagged_mp3`, `cover`, `stems`). Stored with absolute path; `missing: bool` reflects on-disk presence (sweeper-maintained). |
| **List** | User-curated playlist; membership preserved across soft-delete / restore. |
| **Adapter** | Platform-specific browser-automation class `inject(page, track_data)` (not yet implemented; v0.1.0). |
| **Inject** | User action running an adapter against an open browser page; code fills form, user submits. Never auto-submit. |
| **Sidecar** | Python backend (`packages/beatos-*`), launched as child process by Electron main. |
| **MCP** | Model Context Protocol facade. Since v0.0.23: FastMCP server runs inside the sidecar (`beatos-http`), mounted at `/mcp` (Streamable HTTP). Claude Desktop reaches it via the `beatos-mcp` launcher → `mcp-proxy` stdio bridge. Writes require two-phase `await_approval` commit. |

## Data model: flat catalog of tracks

Tracks are global — they belong to BeatOS as a whole. Each track holds 0+ assets, each asset stores an absolute path on disk and a `missing` flag (sweeper-maintained). Lists, search, and filter span the entire catalog. The earlier "Source" concept (registered watched folders, v0.0.4–v0.0.21) was retired in v0.0.22; folder-level auto-import is gone, manual drag-import is the only way new files enter the catalog.

## Layering rules

1. `packages/beatos-core/` is pure Python business logic — no `fastapi` / `mcp` / Electron imports; allowed deps: stdlib, `aiosqlite`, `pydantic`, `playwright`, `mutagen`, `watchdog`, `beatos-platforms` (vocab maps for export renderers).
2. `packages/beatos-http/` and `packages/beatos-mcp/` are thin facades — each route / tool is a few lines calling into `beatos-core`. Since v0.0.23, `beatos-mcp` tools run inside the `beatos-http` process (mounted at `/mcp`); the `beatos-mcp` console script is a stdio bridge launcher only.
3. `apps/desktop/electron/` (main + preload) is thin — spawns sidecar, creates `BrowserWindow`, exposes native dialogs / tray / shortcuts via IPC; business logic stays in `beatos-core`.
4. The renderer (`apps/desktop/src/`) talks to `beatos-http` over `http://127.0.0.1:<port>`; port is ephemeral, written to a JSON handshake file, exposed via `contextBridge` in `preload.ts`.

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
    tracks/                  ← track CRUD + queries; query_parser.py = pure FilterSpec parser + sql_filter.py = shared WHERE-clause builder (both used by HTTP route + MCP tool, no IO)
    assets/                  ← reference / managed mode, relocate
    lists/                   ← user-list CRUD + membership
    audio_analysis/          ← BPM + Key pipeline; pluggable backends/ (essentia | librosa)

packages/beatos-http/        ← FastAPI facade for the renderer
  beatos_http/
    app.py                   ← FastAPI() with CORS, routes mounted
    handshake.py             ← write/read port handshake JSON
    routes/                  ← one router per resource group
    __main__.py              ← uvicorn entry

packages/beatos-mcp/         ← FastMCP tools + stdio bridge launcher
  beatos_mcp/
    server.py                ← FastMCP instance + ASGI app (mounted at /mcp by beatos-http)
    tools/                   ← one module per tool group
    launcher.py              ← discovery + mcp-proxy exec logic
    __main__.py              ← stdio bridge launcher entry (reads handshake, execs mcp-proxy)

packages/beatos-platforms/   ← v0.0.12 per-platform vocab maps; importable package as of v0.0.34
  beatos_platforms/          ← vocab loader (`load_map(platform, field)`)
  <platform>/                ← e.g. netease/ — {genre,mood}-map.json (generated en→zh maps, v0.0.34)
```

## Key components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Migration runner | `packages/beatos-core/beatos_core/db.py` | Applies `migrations/*.sql` not in `schema_version`. Append-only. |
| Handshake writer | `packages/beatos-http/beatos_http/handshake.py` | Writes `{"port", "pid", "started_at"}` JSON before uvicorn accepts. `pid` used by the `beatos-mcp` launcher for staleness detection. |
| Handshake reader | `apps/desktop/electron/main.ts` | Polls handshake file (5s timeout), then creates `BrowserWindow`. |
| Adapter registry | `packages/beatos-core/beatos_core/adapters/registry.py` | Maps platform name → adapter class. |
| Audio analysis cache | `packages/beatos-core/beatos_core/audio_analysis/service.py` + migration `007` (reset by `016` on engine switch) | Essentia BPM+Key; keyed `(asset_id, sha256)` — once per content hash. |
| Audio engine | `apps/desktop/src/renderer/src/lib/audio-engine.ts` | Tone.js singleton; `Tone.Player` + `ToneAudioBuffer` + byte-budgeted LRU cache (256 MB). RAF tick detects natural end + AudioContext suspend (sleep/wake) — no setTimeout-based scheduling. (v0.0.16) |
| Player store | `apps/desktop/src/renderer/src/stores/player.ts` | Zustand singleton; delegates transport to `audioEngine`. Module-level `audioEngine.on(...)` subscriptions bridge engine events → store. No HTMLAudioElement. (v0.0.16) |
| Role-priority resolver | `apps/desktop/src/renderer/src/lib/audio-resolve.ts` | Picks asset via `tagged_wav > untagged_wav > tagged_mp3 > untagged_mp3`. |
| Filter chip bar | `apps/desktop/src/renderer/src/components/FilterChipBar.tsx` + `stores/track-query.ts` | Drives `/api/tracks` sort/filter; AND across fields, OR within. |

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
| Sidecar stdio capture | `apps/desktop/src/main/index.ts` (pipe + readline) | Tag sidecar output `[sidecar]` → electron-log. |
| electron-log file sink | `apps/desktop/src/main/logger.ts` | Dev: `apps/desktop/logs/main.log`; prod: `~/Library/Logs/BeatOS/main.log`. |
| Sidecar crash IPC | `main/index.ts:sidecar.on('exit')` → `IPC_CHANNELS.SIDECAR_CRASHED` | Renderer toast + `api/client.ts` invalidates `cachedBase`. |
| `sources.loadError` | `stores/sources.ts` | Distinguish API failure from "no sources" — drives `<ApiErrorState>` vs `/welcome`. |
| IPC channel constants | `src/shared/ipc-channels.ts` | Typed single source of truth for main + preload. |
| structlog + correlation IDs | `packages/beatos-http/beatos_http/logging_config.py` + `app.py` middleware | One JSON/line at `BEATOS_LOG_PATH` (default `apps/desktop/logs/sidecar.jsonl`); every line has `request_id`. |
| Boot integration test | `packages/beatos-http/tests/test_boot_integration.py` | Real subprocess; asserts handshake + `/api/health` + JSONL output. |
| `BEATOS_LOG_PATH` env contract | passed by Electron main, honored by sidecar `logging_config._default_log_path()` | Callers redirect via env; Electron defers to existing value. |
| Smoke harness | `apps/desktop/scripts/smoke.mjs` + `scripts/smoke/{runner,fixtures,setup,library,player,editor,trash,sidebar}.mjs` (v0.0.19 split) | Playwright `_electron`: launches built app, asserts boot + zero ERROR JSONL. `smoke.mjs` is the thin entry; `runner.mjs` calls section functions in load-bearing chronological order. Each section reads `ctx` (app/window/baseUrl/fixtures/flags) and mutates `ctx.failures`. |
| Dev reset | `apps/desktop/scripts/dev-reset.sh` | Kills orphan uvicorn, frees 5000-5050, clears logs. |
| npm scripts | `dev:fresh`, `smoke`, `logs:tail` | Agent-runnable verification — see `memory/feedback_run_the_tools_you_built.md`. |

## v0.0.6 → v0.0.13 Structural Additions

### v0.0.6 — Drag-Add Lists + Production-Bug Sweep

| Capability | Location | Purpose |
|---|---|---|
| `@dnd-kit/core` drag layer | `apps/desktop/src/renderer/src/App.tsx` (`DndContext` + `DragOverlay`) | Sidebar drag-add (HTML5 native rejected — Playwright `_electron` can't drive it). |
| Multi-select state | `stores/tracks.ts` (`selectedIds: Set<number>` + `anchorId`) | Plain=replace, cmd/ctrl=toggle, shift=range from anchor. |
| `EmptyState` discriminated union | `components/EmptyState.tsx` | Variants `no-tracks` / `empty-list` / `no-search-results` by route + search state. |
| HashRouter (not BrowserRouter) | `App.tsx` | `file://` URLs match no BrowserRouter routes — production was empty until smoke caught it. Never revert. |
| CORS open regex | `packages/beatos-http/beatos_http/app.py` (`allow_origin_regex=r".*"`) | `file://` origin is `null`; safe — sidecar binds `127.0.0.1`. |
| `BEATOS_DB_PATH` env contract | `apps/desktop/src/main/config.ts` (`resolveDbPath`) | Env > config > default. Mirrors `BEATOS_LOG_PATH`. |
| Sidecar log-level prefix parser | `apps/desktop/src/main/log-parse.ts` | Maps uvicorn `INFO:/WARNING:/ERROR:` prefixes to electron-log levels. |

### v0.0.7 — Cover Wiring + Audit Cleanup

| Capability | Location | Purpose |
|---|---|---|
| `_cover_subquery(prefix)` | `packages/beatos-core/beatos_core/tracks/service.py` | Correlated `asset` subquery (role='cover'); injected into every Track SELECT. |
| `Track.cover_asset_id` field | `packages/beatos-core/beatos_core/models/track.py` | Derived — `UNIQUE(track_id, role)` already enforces 1-to-1. |
| Smoke `postJson` helper | `apps/desktop/scripts/smoke.mjs` | Surface status + body for failed seed calls. |
| Drag handle on cover only | `components/TrackRow` cover wrapper | Keep row body clean for click + double-click. |

### v0.0.8 — Splash + Sidecar Fail-Fast

| Capability | Location | Purpose |
|---|---|---|
| `assertSidecarLayout(repoRoot, dirname)` | `apps/desktop/src/main/sidecar-helpers.ts` | Fail-fast `pyproject.toml` check; replaces 5s silent handshake hang. |
| Splash window | `apps/desktop/src/main/splash.ts` (pure helpers `shouldShowSplash` + `closeDelayMs` unit-tested) | 480×320 frameless transparent; HTML inlined as `data:` URL. 1s min + 250ms fade. |
| `--no-splash` CLI flag | `main/index.ts` argv parse | Smoke opts out; asserts `app.windows().length === 1`. |
| Smoke clean-userData default | `scripts/smoke.mjs` | `--keep-userdata` opt-in; no more `/tmp/beatos-smoke-*` accumulation. |

### v0.0.9 — Audio Playback

| Capability | Location | Purpose |
|---|---|---|
| Role-priority resolver | `lib/audio-resolve.ts` | `tagged_wav > untagged_wav > tagged_mp3 > untagged_mp3`. |
| Audio engine | `lib/audio-engine.ts` (v0.0.16) | Tone.js singleton. Owns AudioContext, decode cache, RAF tick. `setBpm()` already in place for future MCP. |
| `usePlayerStore` singleton | `stores/player.ts` | Zustand state mirror of the engine; transport + queue + shuffle + repeat + role. Engine events → store via module-level subscription. (v0.0.16: HTMLAudioElement removed.) |
| Bottom player UI | `components/BottomPlayerBar.tsx` + `RoleSwitcher.tsx` + `TrackRowPlayButton` (in `TrackRow`) | Spotify-style bar; per-row button driven off `has_audio`. Only side-effect outside the engine: forceMuted / volume init + decode-error toast. |
| Audio HTTP route | `packages/beatos-http/beatos_http/routes/assets.py` (`GET /api/assets/audio/{id}`) | `FileResponse` for native HTTP Range. |
| `beatos-asset://audio/{id}` | `apps/desktop/src/main/asset-protocol.ts` | Cover + audio bytes. Registered with `corsEnabled: true` + `supportFetchAPI: true` so Tone's `fetch` → `decodeAudioData` succeeds across the file:// origin. WAV junk-chunk sanitize stays; FLOAT-32 transcode removed (decodeAudioData handles it). |
| `Track.has_audio` derived | `tracks/service.py` `_has_audio_subquery` | Wired into `service.py`, `lists/membership.py`, source-filter route. |
| CSP — audio | `apps/desktop/src/renderer/index.html` | `media-src beatos-asset:` (legacy `<audio>` paths if any) + `connect-src beatos-asset:` (Tone fetch) + `worker-src 'self' blob:` (Tone AudioWorklet). Lost any of these → silent decode failure. |
| BrowserWindow `backgroundThrottling: false` | `apps/desktop/src/main/index.ts` | Audio app — Chromium's default throttle on focus loss stalled playback when user tabbed to another window. (v0.0.16) |
| Migration 005 `track.producer` | `migrations/005_track_producer.sql` | Per-track producer; player-bar subtitle `producer · BPM · Key`. |

### v0.0.10 — TrackEditor Refactor

| Capability | Location | Purpose |
|---|---|---|
| `KeyPicker` + `KeyPickerPopover` | `components/KeyPicker.tsx` + `KeyPickerPopover.tsx` | Splice-style Flat/Sharp tabs + note grid + parallel Major/Minor. Stored as `"F# minor"` / `"Eb major"`. |
| Radix Popover primitive | `components/ui/popover.tsx` | Shared (KeyPicker, ChipMultiSelect, FilterChipBar). |
| `useAssetSlot` hook | `hooks/useAssetSlot.ts` | Slot-state abstraction backing the file-row UI. |
| Row-based files UI | `components/AudioFileRow.tsx` + `FileRowsSection.tsx` | 5 full-width rows (4 audio + Stems); empty rows render "+ Add file". |
| Format helpers | `lib/format-bytes.ts` + `lib/parse-key.ts` (`parseKey` / `formatKey`) | Unit-tested; key parse handles legacy `"F#m"` / `"Cmaj"` until next save. |

### v0.0.11 — Library Table Redesign

| Capability | Location | Purpose |
|---|---|---|
| `/api/tracks` sort + filter | `packages/beatos-http/beatos_http/routes/tracks.py` | `sort_by`/`sort_dir` + per-field filters (Producer, Genre, Mood, Key, BPM range, `has_audio`). |
| `/api/tracks/distinct/{field}` | `routes/tracks.py` + `renderer/api/distinct.ts` | Powers chip-bar filter pickers. |
| `SORTABLE_FIELDS` / `DISTINCT_FIELDS` whitelists | `routes/tracks.py` | Whitelist before f-string interpolation. SQL-injection guard. |
| `useTrackQueryStore` | `stores/track-query.ts` | Sort + filter state; subscribes to `useTrackStore.refresh()`. |
| `FilterChipBar` + `FilterFieldPopover` | `components/FilterChipBar.tsx` + `FilterFieldPopover.tsx` | Single Popover, two views — Radix has no nested popovers. |
| Sortable `TableHeader` | `components/TableHeader.tsx` | Click toggles asc/desc; single active column. |

### v0.0.11.1 — Resizable Cols + Unsaved Dialog

| Capability | Location | Purpose |
|---|---|---|
| `useColumnWidthStore` + `<ColumnResizer>` | `stores/column-widths.ts` + `components/ColumnResizer.tsx` | Session-scoped column widths; drag handles between columns. |
| `UnsavedChangesDialog` + `shallowEqualEditable` | `components/UnsavedChangesDialog.tsx` + `lib/shallow-equal-track.ts` | TrackEditor dirty tracking; Save / Discard / Cancel. |
| `.beatos-scroll` CSS class | renderer global CSS | Hides macOS scrollbar gutter on inner panels. |
| Manual `dialogOpen` state | `TrackEditor.tsx` | Replaces react-router `useBlocker` — incompatible with `<HashRouter>` (needs data router); crashed editor on render. Never reintroduce `useBlocker` here. |

### v0.0.12 — Multi-Value Tags + Native Drag-Out

| Capability | Location | Purpose |
|---|---|---|
| `ChipMultiSelect` | `components/ChipMultiSelect.tsx` (Radix Popover) | Reusable multi-value picker; Producer allows custom-add, Genre/Mood vocab-only. `maxSelections=1` renders as single-select. |
| JSON-array TEXT columns | `migrations/006_multi_value_fields.sql` | `producer` / `genre` / `mood` migrated idempotently into single-element arrays. |
| Multi-value filtering | `tracks/service.py` | `EXISTS (... json_each ... WHERE value IN (?,?))` — any-match within field, AND across fields. |
| Multi-value sorting | `tracks/service.py` | `json_extract($[0])` — first-element sort. |
| Renderer vocab | `data/genres.ts` (74) + `data/moods.ts` (50) | English `en` is canonical stored key; `zh` display-only. |
| Platform vocab maps | `packages/beatos-platforms/<platform>/{genre,mood}-map.json` | Identity stubs; ready for publish adapters in v0.1+. |
| Native cover drag-out | `main/index.ts` `DRAG_OUT_FILE` IPC → `webContents.startDrag` | Drag TrackEditor 200×200 cover into Finder / other apps. Path validation rejects relative + traversal + missing. |

### v0.0.13 — Audio Analysis (BPM + Key)

| Capability | Location | Purpose |
|---|---|---|
| Audio analysis pipeline | `packages/beatos-core/beatos_core/audio_analysis/` — `bpm.py`/`key.py` are thin dispatchers over `backends/` (`essentia_backend.py`, `librosa_backend.py`); `backends/__init__.get_backend()` picks Essentia if installed else librosa (`BEATOS_ANALYSIS_ENGINE` forces). `service.py` caches per `(asset, sha256)` but never caches a total failure (`_has_result`). Duration via mutagen. Essentia is optional/AGPL — see NOTICE. |
| `POST /api/tracks/{id}/analyze` | `packages/beatos-http/beatos_http/routes/analysis.py` | Returns `{bpm, bpm_conf, key, key_conf}`; sync (5–15s on real tracks). |
| `analysis_cache` table | `migrations/007_analysis_cache.sql` | Keyed `(asset_id, sha256)`; CASCADE on asset delete. One analysis per content hash. |
| Renderer API client | `renderer/api/analysis.ts` + `lib/audio-analysis-constants.ts` | Confidence thresholds (BPM ≥ 0.7, Key ≥ 0.6) in constants module. |
| Fire-and-forget auto-fill | `lib/auto-analyze.ts` (`maybeAutoAnalyze`) called from `stores/assets.ts` `attach` | Writes only when field empty AND confidence clears threshold. |
| `AnalyzeResultDialog` + Wand2 button | `components/AnalyzeResultDialog.tsx` + TrackEditor toolbar | Per-field accept dialog with "Replace existing" toggle; `⚠ Low` prefix on sub-threshold. |

### v0.0.14 — Drag-and-Trash

| Capability | Location | Purpose |
|---|---|---|
| Soft-delete | `migrations/008_track_trash.sql` adds `track.deleted_at TEXT NULL` + index | `delete_track()` sets `deleted_at`; `purge_track()` is true hard-delete. `get_track()` does NOT filter trashed (editor loads); `list_tracks()` / `tracks_in_list()` filter `deleted_at IS NULL`. |
| Trash endpoints | `routes/tracks.py` | `DELETE /api/tracks/{id}` (soft) · `?purge=true` · `POST .../restore` · `GET /api/tracks/trash`. Route order: `/trash` before `/{track_id}` so literal wins. |
| Trash UI | `routes/TrashPanel.tsx` + `stores/trash.ts` + `components/Sidebar/TrashSection.tsx` (v0.0.17 split) | Sidebar section with live count; row-level Restore + Delete forever (confirm). List membership preserved across delete/restore. |
| Bulk reorder | `service.py::reorder_sources/lists` + `routes/sources.py / lists.py` | `POST /api/sources/reorder {ids: []}` + same for lists. Atomic single-tx 0..N-1. |
| Sidebar drag-reorder | `components/Sidebar/{SourcesSection,ListsSection}.tsx` (v0.0.17 split) `SortableSourceRow` / `SortableListRow` via `@dnd-kit/sortable` | System list "All Beats" (`kind='system'`) excluded. Track→list droppable id `list-drop:N` to avoid colliding with sortable id `list:N`. |
| Whole-row drag handle | `components/TrackRow.tsx` | dnd-kit `{listeners, attributes}` on row root. PointerSensor activation distance 5px prevents accidental drags on click/dblclick. |
| Drop-to-create-track | `lib/create-track-from-file.ts` + `routes/TrackListPanel.tsx` drop zone | Drop `.wav`/`.mp3` on library → one track per file with smart Source path match. Attach failure rolls back orphan. Always-`preventDefault` on `dragover` (lesson from v0.0.13.2). |
| Single DndContext, multi-type routing | `App.tsx` `onDragEnd` switches on id prefix | `track:` / `source:` / `list:` prefixes route to add-to-list / source-reorder / list-reorder. Avoids nested DndContexts. |

### v0.0.15 — Auto-save + Producer Management

| Capability | Location | Purpose |
|---|---|---|
| Auto-save TrackEditor | `hooks/use-track-editor-state.ts` (v0.0.18 split) (`AUTOSAVE_DEBOUNCE_MS` in `lib/track-editor-helpers.ts`) | Debounced auto-save gated on `isDirty && validTitle && saveState ∈ {idle,saved}`. No auto-retry on error (avoids tight loop). ESC / Close fires `flushAndClose()`. `data-save-status` attribute (on `components/TrackEditor/SaveIndicator.tsx`) is the smoke + test hook. Both `track` and `initialTrack` baseline updated on save so upstream patches (auto-analyze) don't re-fire save. |
| Producer rewrite | `tracks/service.py::rewrite_producer` + `count_tracks_with_producer` | Unified rename / merge / delete: removes matching values from each track's JSON array, appends `to_value` if non-empty. Empty arrays kept as `[]` (not NULL). Matched rows always counted as `affected` even when the resulting JSON equals the original (preview/rewrite count consistency); no-op rows skip the SQL UPDATE. |
| `/api/producers/*` | `routes/producers.py` | `POST /preview {values}` → `{affected}` for confirmation dialogs. `POST /rewrite {from, to}` with `to: null` = delete, non-empty string = rename/merge. `extra='forbid'` on `RewritePayload`. |
| Settings → Producers | `routes/SettingsPanel.tsx` `ProducersSection` | Per-row Remove (mirrors `SourcesSection` layout); no confirmation dialog. Rename / merge live in the ChipMultiSelect ⋯ menu — Settings is bulk-removal only. Refreshes distinct list + `useTrackStore` after success. |
| ChipMultiSelect `⋯` per option | `components/ChipMultiSelect.tsx` (`onRenameOption` / `onDeleteOption` props) | Hover-revealed manage button swaps the row for an inline rename input + Check / Trash / Cancel. Calls back to the parent — picker itself doesn't import API. Wired only for Producer in TrackEditor. |
| Smoke 3-day artifact purge | `scripts/smoke.mjs` startup block | Regex-gated `^smoke-\d+\.(png\|jsonl)$`; mtime older than 3 days unlinked. Leaves `main.log` / `sidecar.jsonl` / other shapes alone. Best-effort (race-tolerant). |
| Closable + resizable preview panel | `routes/TrackDetailPanel.tsx` + `stores/preview-panel.ts` + `components/TopBar.tsx` toggle | Left-edge hover resizer (`280..600px` clamp) + corner X close button + TopBar `PanelRightOpen/Close` toggle. Open/width persisted in sessionStorage. |
| Tone.js engine reset on load | `lib/audio-engine.ts::load()` | Every `load(assetId)` disposes the previous `Tone.Player`, stops RAF, and runs through `loading → paused`. No `loadEpoch` workaround needed — the state machine self-recovers from any prior `error` (the v0.0.15 trick is gone). |
| Headless + muted test mode | `main/splash.ts::closeSplashAndShowMain` + `preload/index.ts::isAudioForceMuted` + `BottomPlayerBar.tsx` | `BEATOS_HEADLESS=1` skips `mainWin.show()`; `BEATOS_AUDIO_MUTED=1` exposes a preload flag `BottomPlayerBar` passes to `audioEngine.setForceMuted(true)` on mount. Smoke / diagnose harnesses opt in by default; pass `SMOKE_SHOW=1` / `SMOKE_UNMUTED=1` to override. |
| Sort-preserved switching | `stores/player.ts::loadAndPlay(targetStatus)` | `next()`/`prev()`/`setPreferredRole` pass `"preserve"` so a paused user stays paused after a track or WAV↔MP3 switch. `playFromQueue` keeps default `"playing"` (explicit play intent). |

### v0.0.20 — Stable MCP Framework

| Capability | Location | Purpose |
|---|---|---|
| SQLite WAL in `run_migrations` | `packages/beatos-core/beatos_core/db.py:run_migrations` | `PRAGMA journal_mode=WAL` set on every connection; prevents SQLITE_BUSY when MCP reader overlaps HTTP writer. |
| `tokens` table (2PC skeleton) | `packages/beatos-core/beatos_core/migrations/009_tokens.sql` | Single-use tokens for future write tools; schema is additive, no write tools yet. |
| 2PC helpers | `packages/beatos-mcp/beatos_mcp/two_phase.py` | `issue_token(db, action, payload)` + `consume_token(db, token_id)` — write tools call `consume_token` inside the same DB transaction as the actual write. |
| 5 MCP read tools | `packages/beatos-mcp/beatos_mcp/tools/` + `server.py` | `ping`, `list_tracks`, `get_track`, `list_lists`, `list_distinct_values` — all registered and exercised by pytest. (`list_sources` removed in v0.0.22 with the Source concept.) |
| `BEATOS_DB_PATH` env discovery | `packages/beatos-mcp/beatos_mcp/db.py` | MCP process opens `BEATOS_DB_PATH` directly (read-only SQLite); raises on unset — no silent fallback. |
| MCP structlog → JSONL | `packages/beatos-mcp/beatos_mcp/log.py` | `configure()` routes all log output to file + stderr; stdout is reserved for JSON-RPC only. |
| Settings "AI Integration" panel | `apps/desktop/src/renderer/src/components/Settings/AIIntegrationSection.tsx` | Renders the Claude Desktop config snippet and `mcp:test-connection` result; copy-to-clipboard. |
| `mcp:test-connection` IPC | `apps/desktop/src/main/mcp/test-connection.ts` | Main-process handler spawns `beatos-mcp` with `--ping`; resolves/rejects within 5 s; result surfaced in AI Integration panel. |

### v0.0.21 — First Write Tool + HTTP Approve Surface

| Capability | Location | Purpose |
|---|---|---|
| `tokens.result` column | `packages/beatos-core/beatos_core/migrations/010_tokens_result.sql` | JSON column added to tokens table; stores 2PC write outcomes (e.g., `{"list_id": 7}`) so confirm_* tools have deterministic answers. |
| 2PC helpers (shared) | `packages/beatos-core/beatos_core/two_phase.py` | Moved from `beatos-mcp` in v0.0.21 so `beatos-http` can import. Functions: `create_token`, `verify_token` (read-only — expiry check only, no commit), `consume_token`, `consume_token_with_result`, `reject_token`, `get_token_status`, `cleanup_terminal_tokens`. Errors: `TokenError` (all 2PC failures), `RowVanishedError` (batch mid-approve row disappearance → HTTP 409). Default TTL: 600s. |
| Approve dispatcher | `packages/beatos-http/beatos_http/routes/tokens.py::_APPROVE_HANDLERS` | Registry-pattern dispatch keyed by `tool_name`. Each write tool adds one `@register_approve_handler` decorator. Handler ran inside `BEGIN IMMEDIATE` transaction (removed in v0.0.24); verify + write + consume are atomic. |
| Token cleanup task | `packages/beatos-http/beatos_http/app.py::_periodic_token_cleanup` | Sidecar lifespan startup runs cleanup once, then hourly loop. Transitions pending→expired past TTL; deletes terminal-state rows older than 7 days. |
| SSE token stream | `GET /api/tokens/stream` | Real-time push to renderer via `pending_changed` events. Internally polls SQLite at 1 s interval. Used by Settings panel to auto-refresh pending approvals. |
| Token list endpoint | `GET /api/tokens?status=pending` | Returns all pending tokens (tool_name, payload, created_at, expires_at). Consumed by Settings → AI Integration → Pending confirmations. |
| Approve endpoint | `POST /api/tokens/{token}/approve` | Atomic verify+write+consume. Calls the registered handler for the token's `tool_name`. Returns the handler's result dict (e.g., `{"list_id": 7, ...}`). 404 if token not found; 409 if not in pending state. |
| Reject endpoint | `POST /api/tokens/{token}/reject` | Race-tolerant rejection. No-op on already-terminal tokens (handles Approve/Reject race). 404 if token doesn't exist. |
| First write tool | `packages/beatos-mcp/beatos_mcp/tools/create_list.py` | Phase 1 (`create_list`) issues token only. User clicks Approve in BeatOS Settings; handler writes list table. Phase 2 is `await_approval(token)` — tool-agnostic, returns `{token, tool_name, status, result?}`. |

### v0.0.27 — Multi-currency License Tiers + Default Templates

| Capability | Location | Purpose |
|---|---|---|
| `license_tier.prices_json` | `packages/beatos-core/beatos_core/migrations/015_license_tier_multi_currency.sql` | Replaces the old `price + currency` pair. JSON object `{"CNY": 300, "USD": 50}`; empty `{}` = tier exists but is unpriced. Backfilled from the dropped columns via `json_object(currency, price)`. Migration also clears any in-flight `set_license_tiers` tokens because their payload shape changed. |
| `app_setting` table | `packages/beatos-core/beatos_core/migrations/014_app_setting.sql` | Generic catalog-level key/value JSON store. First consumer: `default_license_tiers` — the templates auto-applied to every renderer-created track (`stores/tracks.ts::create` + `lib/create-track-from-file.ts`). MCP `create_tracks` intentionally does NOT pull these defaults (agents typically want full control over the tier set they're importing). Second consumer (v0.0.36): `vocab_locale` (`both`/`zh`/`en`, default `both`) — the renderer-only genre/mood display language. Hydrated at boot into `stores/vocab-locale.ts`; every display site routes labels through the single helper `data/vocab-label.ts::formatVocabLabel(value, kind, locale)`. Stored genre/mood values stay English-canonical and NetEase export is unaffected. |
| Core service | `packages/beatos-core/beatos_core/licenses/service.py` + `packages/beatos-core/beatos_core/app_settings/service.py` | License CRUD shape now uses `prices: dict[str, float]` (whole-replace on update, not per-key merge). `_normalize_prices` uppercases keys, rejects negatives, raises ValueError for non-dict input. App-settings is a thin upsert (`ON CONFLICT(key) DO UPDATE`). |
| HTTP routes | `packages/beatos-http/beatos_http/routes/licenses.py` + `routes/app_settings.py` | License endpoints unchanged in shape, just propagate the new `prices` field. App-settings: `GET/PUT/DELETE /api/app_settings/{key}`; PUT body is `{"value": <json>}`. |
| MCP `set_license_tiers` | `packages/beatos-mcp/beatos_mcp/tools/licenses.py` | Tier shape: `{name?, deliverables?, prices?: {currency: amount}, notes?}`. Old `price + currency` top-level fields are now rejected as unknown. Tool description rewrites the example to use the dict form and recommends one deliverable per tier so the renderer's preset slots fill cleanly. Tool count unchanged at 21. |
| Editor UI | `apps/desktop/src/renderer/src/components/TrackEditor/LicenseTiersSection.tsx` + `components/Settings/DefaultLicenseTiersSection.tsx` | Three input slots per row: CNY + USD always visible, third slot is a currency picker (EUR/JPY/GBP/none). Settings page exposes the same layout for default-tier templates. |

### v0.0.26 — License Tiers (history)

| Capability | Location | Purpose |
|---|---|---|
| `license_tier` table | `packages/beatos-core/beatos_core/migrations/013_license_tiers.sql` | One-to-many per track (positioned). `deliverables` stored as JSON-array TEXT; recommended tokens `mp3` / `wav` / `stem` but free strings accepted so platform adapters can map their own vocab. Backfilled from the dropped `track.license_type` + `track.price` only for rows where the user had set a non-default value. Superseded in v0.0.27 by migration 015 which dropped `price`/`currency` columns in favour of `prices_json`. |

`track.license_type` (TEXT) and `track.price` (REAL) were dropped by migration 013. The renderer `Track` interface no longer carries them; any code referring to them is a pre-v0.0.26 leftover and should be removed.

### v0.0.35 — Bulk Metadata Edit + Batch Analyze

| Capability | Location | Purpose |
|---|---|---|
| `beatos_core.tracks.patch` | `packages/beatos-core/beatos_core/tracks/patch.py` | Shared multi-value delta helper: `apply_array_patch` (list-replace or `{add?, remove?}` merge), `FIELD_TO_COL`, `SCALAR_FIELDS`. Consumed by the new `bulk_update_tracks` core function AND the existing MCP approve handler (`update_tracks`/`merge_metadata`). |
| `bulk_update_tracks` | `packages/beatos-core/beatos_core/tracks/service.py` | Applies one patch to many tracks in a single transaction. Scalar fields set directly; multi-value fields (genre/mood/producer) use `apply_array_patch`. |
| `count_unanalyzed` | `packages/beatos-core/beatos_core/tracks/service.py` | Returns the number of tracks that have no cached BPM/Key result for any audio asset. Used by the library-top "分析全部未分析 (N)" button. |
| Batch analysis job | `packages/beatos-http/beatos_http/routes/batch_analysis.py` | In-memory job dict; `POST /api/analysis/batch` starts a background asyncio task, `GET /api/analysis/batch/{job_id}` returns `{status, total, done, failed}`. Autofills BPM/Key on empty fields at high-confidence threshold only. |
| `GET /api/tracks/unanalyzed/count` | `routes/batch_analysis.py` | Returns `{count: int}` — tracks that have no cached BPM/Key result. Polled by the renderer to display the "分析全部未分析 (N)" label. |
| `POST /api/tracks/bulk-update` | `packages/beatos-http/beatos_http/routes/bulk.py` | Body `{ids, patch}` — applies `bulk_update_tracks` to the given track IDs. Returns `{updated: int}`. |
| `POST /api/tracks/bulk-apply-license-template` | `routes/bulk.py` | Body `{ids}` — copies the stored `default_license_tiers` app setting onto each track. Returns `{updated: int}`. |
| Renderer API clients | `apps/desktop/src/renderer/src/api/bulk.ts` + `api/analysis.ts` additions | Typed fetch wrappers for the five new routes. |
| `AnalysisProgressBar` + job store | `components/AnalysisProgressBar.tsx` + `stores/analysis-job.ts` | Docked progress bar shown while a batch job is running; 1 s polling; dismissible on completion. |
| `BulkEditDialog` | `components/BulkEditDialog.tsx` | Modal for per-field merge mode (追加 / 覆盖 / 移除 for Genre/Mood/Producer) + Apply default license template action. |
| `BulkActionBar` wiring | `components/BulkActionBar.tsx` | "编辑元数据" opens `BulkEditDialog`; "分析选中" posts `POST /api/analysis/batch` for the current selection. |
| Library-top analyze button | `routes/TrackListPanel.tsx` | "分析全部未分析 (N)" button visible when unanalyzed count > 0; posts `POST /api/analysis/batch` with all unanalyzed IDs. |

**Autofill-threshold coupling:** `BPM_AUTOFILL_CONFIDENCE` (0.7) and `KEY_AUTOFILL_CONFIDENCE` (0.6) are defined in both `apps/desktop/src/renderer/src/lib/audio-analysis-constants.ts` (TypeScript) and `packages/beatos-core/beatos_core/audio_analysis/constants.py` (Python). Both sides must be changed together — the Python constants govern batch-job autofill in the sidecar; the TypeScript constants govern single-track auto-analyze and UI threshold display.

### v0.0.23 — MCP Transport Migration

| Capability | Location | Purpose |
|---|---|---|
| FastMCP server | `packages/beatos-mcp/beatos_mcp/server.py` | Replaces low-level `mcp.server.Server`. Defines 7 tools (5 read + `create_list` + `await_approval`). Exports `mcp` (FastMCP instance) and `app` (ASGI app). |
| `/mcp` route | `packages/beatos-http/beatos_http/app.py` (`app.mount("/mcp", mcp_asgi_app)`) | MCP Streamable HTTP endpoint served by the sidecar process. Single-process SQLite ownership; `BEGIN IMMEDIATE` workaround removed in v0.0.24. |
| Stdio bridge launcher | `packages/beatos-mcp/beatos_mcp/launcher.py` + `__main__.py` | Reads `handshake.json` (port + pid), validates sidecar liveness, execs `mcp-proxy --transport streamablehttp <url>`. Claude Desktop config unchanged. |
| `pid` in handshake | `packages/beatos-http/beatos_http/handshake.py` | Launcher uses pid for staleness detection (stale file from crashed sidecar). |
| Tool annotations | `server.py` `@mcp.tool(annotations=...)` | `readOnlyHint` + `idempotentHint` on all read tools and `await_approval`. |
| `await_approval(token)` | `beatos_mcp/tools/await_approval.py` | Unified 2PC status-check tool; tool-agnostic envelope `{token, tool_name, status, result?}`. `confirm_create_list` alias removed in v0.0.24. |

## MCP surface

`packages/beatos-mcp/server.py` registers **24 tools** as of v0.0.34 — **9 read + 15 write** (verify with `grep -c '@mcp.tool' server.py`). Every write tool is two-phase: phase 1 issues a single-use token; the user approves in BeatOS Settings (`POST /api/tokens/{token}/approve`); the agent polls `await_approval(token)`. No write tool mutates the DB directly.

| Tool | Type | Status |
|---|---|---|
| `ping` | read | Shipped v0.0.20. |
| `list_tracks(filter?)` / `get_track(id)` | read | Shipped v0.0.20. |
| `list_lists` / `list_distinct_values` | read | Shipped v0.0.20. (`list_sources` shipped v0.0.20, removed v0.0.22.) |
| `await_approval(token)` | read | Shipped v0.0.23. Unified 2PC status-check across all write tools. |
| `search_tracks(query)` | read | Shipped v0.0.28. Parses the query via `beatos_core.tracks.query_parser.parse_query` AND builds the WHERE clause via `beatos_core.tracks.sql_filter.build_filter_clauses` — the SAME parser + builder the HTTP `GET /api/tracks?query=` route uses, so agent search and in-app search return identical results. |
| `list_export_platforms()` | read | Shipped v0.0.34. Returns the registry of supported export platforms (e.g. `netease`). Backed by the same service as `GET /api/export/platforms`. |
| `export_metadata(track_id, platform)` | read | Shipped v0.0.34. Returns a structured `ExportResult` with per-field platform-shaped metadata (en→zh mapping, single-genre downgrade, price lines). Backed by the same `beatos_core.export` service as `GET /api/tracks/{id}/export`, so agent output matches in-app output. |
| `create_list` | write (2PC) | Shipped v0.0.21 (first write tool). |
| `update_list` / `delete_list` | write (2PC) | List rename/delete. |
| `add_tracks_to_list` / `remove_tracks_from_list` / `reorder_list` | write (2PC) | List curation. |
| `trash_tracks` / `restore_tracks` / `purge_tracks` | write (2PC) | Lifecycle (soft-delete / restore / hard-delete). |
| `update_tracks` / `merge_metadata` | write (2PC) | Track-field edits. |
| `set_license_tiers` | write (2PC) | Multi-currency license tiers (v0.0.26–27). |
| `create_tracks` / `attach_assets` / `detach_assets` | write (2PC) | Ingest (catalog rows + asset references). |
| `inject_to_platform(track_id, platform)` | write | Future — returns `confirm_token`; agent must call `confirm_inject(token)` separately. |
| `suggest_tags(track_id)` / `find_similar(track_id)` | read | Future — v0.2 / v0.3 (audio + text RAG). |

Trust boundary = local stdio process; no network auth needed. See [ROADMAP.md](../ROADMAP.md) for the build sequence.

## What NOT to change without reading context first

- `migrations/001_init.sql` — never modify after applied; add `002_*.sql` and forward.
- The two-phase commit pattern on MCP write tools — non-negotiable.
- The Electron main / renderer separation — never `nodeIntegration: true`; always go through `preload.ts` contextBridge.
- **MCP launcher NEVER writes to stdout.** The `beatos-mcp` launcher (`__main__.py`, `launcher.py`) and `mcp-proxy` subprocess space must use `beatos_mcp.log`; stdout is the JSON-RPC pipe to Claude Desktop. Tool implementations run in the sidecar HTTP process and are NOT subject to this constraint.
- **`tokens` table + `two_phase.py` are skeleton for v0.0.21+.** Do not gate them behind feature flags or remove. Write tools must call `consume_token` inside the same DB transaction as the actual write.
- **`BEATOS_DB_PATH` is the contract with Claude Desktop.** Do not silently fall back to a default if unset — `beatos_mcp/db.py` must raise an explicit error so the AI client gets a clear signal, not a wrong-DB silently returning zero rows.
- **`beatos_core.two_phase.verify_token` is read-only.** Must NOT call `conn.commit()`. The lazy-expire commit (v0.0.20) was removed in v0.0.21 because it broke outer transactions (approve handler needs `verify+insert+consume` atomic). The cleanup task (`_periodic_token_cleanup`) owns the `pending → expired` transition.
- **`_APPROVE_HANDLERS` in `beatos_http/routes/tokens.py` is the sole translator.** This registry is the only place that maps a token's `tool_name` to actual write code. Do not dispatch tokens from the MCP server side; all write tool dispatch must go through `POST /api/tokens/{token}/approve` in the HTTP facade.
- New MCP write tools register an approve handler via `@register_approve_handler(tool_name)` in `packages/beatos-http/beatos_http/handlers/<group>.py`. Do not add ad-hoc routes for write surfaces — `_APPROVE_HANDLERS` is the dispatch.
