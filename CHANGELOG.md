# Changelog

All notable changes to BeatOS will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); BeatOS uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html) starting at `0.0.1`.

## [0.0.4] - 2026-05-15 — Multi-Source Unification

### Architecture

- Pivoted from per-library OS mount-point model to Steam-style unified catalog.
- "Library" terminology replaced by **Source** in UI and schema.
- Tracks are global; Source affiliation is derived at query time from
  `asset.abs_path` prefix-matching against `source.root_path`.
- Lists, search, filters, and metadata edits all span Sources.

### Added

- `/api/sources` CRUD + per-Source status endpoint.
- `SourceStatusMonitor` polling daemon (5s default; emits transitions).
- `WatcherRegistry` running one `watchdog` observer per online Source.
- `OutOfSourceDialog` (Copy / Move / Add as Source) when a picked file lies
  outside every registered Source — backend returns structured 422.
- Four audio role variants (`audio_tagged_mp3`, `audio_untagged_mp3`,
  `audio_tagged_wav`, `audio_untagged_wav`) plus `cover` and `stems` for
  a 6-slot grid in the Track Editor.
- `BEATOS_DB_PATH` env var; default `~/Music/BeatOS/global.db`.
- Settings → Storage section (DB path override) + Sources section.
- New IPC: `storage:get-db-path`, `storage:set-db-path`, `storage:pick-folder`,
  `fs:copy-into-source`, `fs:move-into-source`.

### Changed

- `/api/tracks` accepts `?source_id=<id>` filter.
- `/api/tracks/:id/assets` accepts `?replace=true` for atomic DELETE+INSERT
  (fixes cover-attach 409 when slot is occupied).
- Renderer `apiPost`/`apiGet`/etc. throw a typed `ApiError` carrying `status`
  and `body` so callers can introspect structured server errors.
- Sidebar: SOURCES + LISTS two-section layout; single-select Source filter
  with synthetic "All Beats" row aggregating track counts.
- `AppShell` uses `h-screen` so only the editor scrolls (carry-on #1).
- TopBar: brand + route title + global Search + Settings icon — no more
  back/forward nav, no version badge.
- Welcome: "Add your first Source" framing.
- Charter §6 rewritten (Sources, not Libraries); §18 rule 9 gained a v0.0.4
  exception note (one-time schema reset).

### Removed

- `/api/library/*` and `/api/watch-folders/*` endpoints.
- `beatos_core.library` Python module; `state.require_active`; library service.
- `useLibraryStore`, `LibrarySidebar`, `LibrarySwitcher`, `useWatcherStore`,
  `FirstScanModal`, `WatchFolderRow`, `OnboardingDriver`.
- Dead fields: `track.library_id`, `track.platform_data`, `list.library_id`.

### Migration

- v0.0.3 was never publicly released — no migration path provided.
- v0.0.4 is a one-time schema reset; append-only rule resumes after.
- If you have a `~/Library/Application Support/BeatOS/` registry from a dev
  build, delete it; BeatOS now reads `~/Music/BeatOS/global.db` by default.

## [0.0.3] - 2026-05-14

### Added

- **Asset attachment**: track editor gains a Files section with three slots
  (Audio / Stems / Cover). Audio attaches auto-fill the track's BPM if it
  was empty. Linked mode by default — files stay where they live on disk.
- **Watch folder daemon**: opt-in via Settings; on adding a folder, BeatOS
  scans it once and prompts to import existing files; afterwards, any new
  audio file dropped into the folder becomes a draft track automatically.
- **Missing-file recovery**: a startup sweep + periodic check marks moved
  or deleted files as `missing`. Clicking "Find file" silently re-links
  when the new file's sha256 matches the stored hash.
- **User-created lists**: `list` + `track_list` tables. Sidebar surfaces
  All Beats (system) + user Lists + Beattapes. Right-click a track to add
  it to any user list.
- **Welcome screen**: first launch (or stale library path) shows a proper
  welcome with "Choose Library Folder" + "Use default (~/BeatOS)" buttons.
  No more naked folder dialog on launch.
- **Library quick switcher**: dropdown from the sidebar's "Library" title
  swaps the active library without leaving Settings.
- **List virtualization** via @tanstack/react-virtual — smooth scrolling
  at 500+ tracks.
- **Search**: Cmd+F focuses a search input filtering title / tags / genre
  client-side.
- **Right-click context menu** on track rows: Edit · Add to list ▸ ·
  Reveal in Finder · Delete (with inline confirm).
- **Hover-delete icon** on track rows for fast clean-up.
- **Cover art**: right panel renders 320×320 (when set); track rows show
  40×40 thumbnails. Loaded via a new `beatos-asset://` custom Electron
  protocol so the renderer can display local files securely.
- **Track creation flow**: clicking + Add Track now opens an EMPTY editor
  at `/tracks/new`; no DB row is created until you click Save. ESC discards
  cleanly.
- **TopBar route title** shows the current route (All Beats / Editor /
  Settings / list name).

### Changed

- Asset `mode` value: future inserts use `'linked'` instead of the old
  inline-comment value `'referenced'`. The schema column itself didn't
  change (no migration needed).
- `init_library_root` expands `~` so `~/BeatOS` works as a library path.
- The `migrations/` directory grew to two files. The runner already
  applies new migrations on startup; nothing else changes.

### Notes

- **Managed Move** (the "Move into BeatOS library" action that
  destructively moves files into the library root): the schema supports
  it; the HTTP endpoint returns 501; the UI shows a disabled menu item.
  Real implementation lands in v0.0.4.
- **BeatStars / Airbit injection** is no longer planned for v1.0.
  The v0.0.4 milestone will be reshuffled in a separate charter session.
- Charter §15 v0.0.3 language clarified: Linked (default) vs Managed
  (Move into BeatOS library; v0.0.4).

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

- Initial walking skeleton: Electron + React + Vite + Tailwind + shadcn renderer; Python 3.11 sidecar with FastAPI `/api/health` route; MCP server with `ping` tool.
- Three-package Python workspace (`beatos-core`, `beatos-http`, `beatos-mcp`) under `uv`.
- SQLite schema migration `001_init.sql` (library / track / asset / watch_folder / settings / schema_version).
- Design tokens (Spotify-dark palette) seeded into the renderer; Inter + JetBrains Mono fonts.
- Repository harness (CLAUDE.md, AGENTS.md, conventions) customized from `averatec/averatec-harness-template`.

### Notes

This release is structural only — no end-user features yet.
