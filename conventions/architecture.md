# Architecture

Code-level architecture for AI agents touching files in this repo. Product context first, then layering rules, directory map, per-version capability tables, and the MCP surface plan. For pending work see [ROADMAP.md](../ROADMAP.md); for shipped history see [CHANGELOG.md](../CHANGELOG.md).

## Vision

BeatOS is a local-first desktop app for beat producers — catalog beats and their assets, publish to multiple platforms via browser automation, expose the library to AI agents over MCP. Single-user, no server, no telemetry. Target user: indie beat-makers with 50-500 beats selling on 2+ platforms (BeatStars, Airbit, NetEase).

## Glossary

| Term | Meaning |
|---|---|
| **Track** | Beat record with metadata + 0+ assets; globally unique, not owned by any Source. |
| **Asset** | File attached to a Track via `role` (`audio_tagged_wav`, `audio_untagged_mp3`, `cover`, `stems`). |
| **Source** | Registered folder BeatOS watches; affiliation computed at runtime by `abs_path` prefix-matching `root_path`. |
| **List** | User-curated playlist; membership preserved across soft-delete / restore. |
| **Adapter** | Platform-specific browser-automation class `inject(page, track_data)` (not yet implemented; v0.1.0). |
| **Inject** | User action running an adapter against an open browser page; code fills form, user submits. Never auto-submit. |
| **Sidecar** | Python backend (`packages/beatos-*`), launched as child process by Electron main. |
| **MCP** | Model Context Protocol stdio facade; mirrors HTTP reads, writes require two-phase `confirm_*` commit. |

## Data model: Sources, not Libraries

Tracks are global — they belong to BeatOS as a whole, not to any Source; Source affiliation is derived at runtime by path-prefix matching, and an offline Source (drive unplugged) leaves its tracks read-only for file ops but fully editable for metadata, with Lists / search / filter spanning all Sources. Settled in v0.0.4 after the per-Source mount-point model was rejected.

## Layering rules

1. `packages/beatos-core/` is pure Python business logic — no `fastapi` / `mcp` / Electron imports; allowed deps: stdlib, `aiosqlite`, `pydantic`, `playwright`, `mutagen`, `watchdog`.
2. `packages/beatos-http/` and `packages/beatos-mcp/` are thin facades — each route / tool is a few lines calling into `beatos-core`.
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
| Migration runner | `packages/beatos-core/beatos_core/db.py` | Applies `migrations/*.sql` not in `schema_version`. Append-only. |
| Handshake writer | `packages/beatos-http/beatos_http/handshake.py` | Writes `{"port", "started_at"}` JSON before uvicorn accepts. |
| Handshake reader | `apps/desktop/electron/main.ts` | Polls handshake file (5s timeout), then creates `BrowserWindow`. |
| Adapter registry | `packages/beatos-core/beatos_core/adapters/registry.py` | Maps platform name → adapter class. |
| Audio analysis cache | `packages/beatos-core/beatos_core/audio_analysis/service.py` + migration `007` | librosa BPM+Key; keyed `(asset_id, sha256)` — once per content hash. |
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
| Smoke harness | `apps/desktop/scripts/smoke.mjs` | Playwright `_electron`: launches built app, asserts boot + zero ERROR JSONL. |
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
| Audio analysis pipeline | `packages/beatos-core/beatos_core/audio_analysis/` (`bpm.py`, `key.py`, `pipeline.py`, `service.py`, `models.py`) | HPSS→percussive→`beat_track` for BPM (hop_length=256); HPSS→harmonic→`chroma_cqt`→Krumhansl-Schmuckler for Key. librosa dep. |
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
- The Electron main / renderer separation — never `nodeIntegration: true`; always go through `preload.ts` contextBridge.
