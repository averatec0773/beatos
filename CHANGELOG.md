# Changelog

All notable changes to BeatOS will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); BeatOS uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html) starting at `0.0.1`.

## [0.0.14.1] - 2026-05-17 — Playback for DAW-produced WAVs

### Fixed

- **Recurring "Playback stuck" / "SRC_NOT_SUPPORTED" bug** with WAV files
  exported from DAWs (Pro Tools, FL Studio, Logic). Root cause: Electron 39's
  Chromium WAV decoder silently rejects RIFF files that contain a `JUNK`
  chunk before `fmt ` (sector-align padding) or `cue `/`LIST`/`smpl` chunks
  after `data` (markers, metadata). Multiple prior fixes targeted transport
  (Range header, buffering, MIME normalization, retry watchdogs) and
  consequently never resolved the actual parser-level rejection. Diagnosed
  with a new `apps/desktop/scripts/diagnose-playback.mjs` harness that
  captured the SRC_NOT_SUPPORTED fire within 80 ms — too fast to be a
  transport issue.

### Added

- `repairWavIfNeeded()` in `apps/desktop/src/main/asset-protocol.ts`:
  rebuilds a minimal `RIFF`→`fmt `→`data` WAV from any input, preserving
  every audio byte verbatim. Zero-copy fast path for clean WAVs; runs only
  for WAVs that actually need it. Bounded against malformed chunk sizes.
- 8 unit tests in `apps/desktop/src/main/__tests__/asset-protocol.test.ts`
  covering clean / DAW / non-WAV / un-repairable / malformed-size inputs.
- Smoke regression assertion #30: synthetically constructs a DAW-style WAV
  (JUNK + trailing `cue ` chunks), attaches it, clicks play, and verifies
  `audio.duration > 0` and `audio.currentTime` advances after 1.5 s.
- `apps/desktop/scripts/diagnose-playback.mjs`: standalone harness for
  future audio playback investigations. Takes a `BEATOS_TEST_AUDIO=` path
  or `--tiny`/`--large` flags; instruments every HTMLMediaElement event.

### Changed

- Asset protocol now buffers the full upstream body before responding
  (required to apply WAV repair across the whole file) and returns 200 OK
  without `Accept-Ranges`. Chrome's two-phase WAV probe over a proxied
  range chain was a fragile signal source even when the bytes were valid;
  one bounded full-file fetch is simpler and the per-play cost (~10-30 ms
  for typical files) is imperceptible. Non-audio assets (covers) unaffected.
- Normalize `audio/x-wav` and `audio/vnd.wave` MIMEs to `audio/wav` — the
  Chromium media stack accepts the variants but is picky about edge cases.
- Bottom player: dropped the 5 s blanket "stuck-load" watchdog (was based
  on the wrong theory that loading could silently take >5 s). `onError`
  catches all real failures within 80 ms; the watchdog only generated
  false positives on slow disks. State machine simplified.

### Notes

- The fix is purely byte-level RIFF surgery — no transcoding, no codec
  dependency, no audio quality impact.
- 30 smoke assertions / 212 vitest / 213 sidecar pytest all pass.

---

## [0.0.14] - 2026-05-17 — Drag-and-Trash

### Added

- **Trash** (soft-delete): right-click → Delete now moves a track to
  trash instead of hard-deleting. New TRASH section in the sidebar
  with live count; new `/trash` view lists trashed tracks with
  per-row **Restore** and **Delete forever** actions. List membership
  (`list_track` rows) is preserved across delete/restore.
- **Sidebar reorder**: drag Sources within SOURCES, or Lists within
  LISTS, to reorder. Persisted via `POST /api/sources/reorder` and
  `POST /api/lists/reorder` bulk endpoints (single transaction).
  System list "All Beats" is excluded from sortable.
- **Whole-row drag handle**: dragging anywhere on a track row now
  starts the list-membership drag (was previously only the cover
  thumbnail). Click and double-click still work via PointerSensor
  activation distance (5 px).
- **Drop audio files on main view** to create new tracks: drop one
  or more `.wav` / `.mp3` files anywhere in the library section →
  auto-creates one track per file, attaches the audio with the
  matching role (`audio_tagged_wav` / `audio_tagged_mp3`), and
  fires-and-forgets the existing auto-analyze hook. Smart Source
  match: picks the Source whose `root_path` is a prefix of the
  dropped file's absolute path, falling through to the existing
  OutOfSourceDialog when the file is outside all Sources.

### Changed

- `DELETE /api/tracks/{id}` now soft-deletes (sets `deleted_at`).
  Existing callers see no contract change. New `?purge=true` query
  param triggers a true hard delete via `purge_track()`.
- `get_track()` still returns trashed tracks (so the editor can route
  to a trashed id and show a banner later); `list_tracks()` and
  `tracks_in_list()` filter them out by default.
- Source/List Pydantic models surface `position` as writable;
  pre-existing single-row PUT still works.

### Migration

- Migration `008_track_trash.sql` adds `track.deleted_at TEXT NULL`
  with an index. Idempotent — re-running is a no-op.

### Notes

- dnd-kit nested-context avoidance: a single `<DndContext>` (in
  `App.tsx`) hosts all drag types; `onDragEnd` routes by id prefix
  (`track:` / `source:` / `list:`). Track-to-list drop target was
  renamed to `list-drop:N` to avoid colliding with the sortable
  `list:N` reorder id.
- Always-`preventDefault` lesson from v0.0.13.2 re-applied to the
  new main-view drop zone.
- 29 smoke assertions (+3 new), 3-run stable. 213 sidecar pytest,
  204 vitest.

## [0.0.13.2] - 2026-05-17

### Fixed

- Audio drop zone now calls `preventDefault` on `dragover` so the browser
  no longer opens the dropped file in a new tab when the drop misses.
- Smoke harness gains negative-path coverage for the audio drop zone
  (asserts the page does not navigate away on a missed drop).

## [0.0.13.1] - 2026-05-17

### Fixed

- 6-item TrackEditor polish pass: tightened spacing, dialog copy, and
  `KeyPickerPopover` / `ChipMultiSelect` micro-interactions.
- Audio file rows accept native OS drag-drop (was previously click-only),
  matching the cover drop zone behavior.
- Renderer `apiPost`/`apiPut` now surface server-side error `detail`
  in the thrown `ApiError`, so failed `/analyze` calls and similar
  routes show a meaningful message instead of a generic 500.

## [0.0.13] - 2026-05-17 — Audio Analysis (BPM + Key)

### Added

- librosa-based audio analysis pipeline (`audio_analysis/` module):
  HPSS → percussive component → `beat_track` for BPM; HPSS → harmonic
  component → `chroma_cqt` → Krumhansl-Schmuckler correlation for Key.
- `POST /api/tracks/{id}/analyze` endpoint returns `{bpm, bpm_conf,
  key, key_conf}`; results cached by `(asset_id, sha256)` so a file
  is only analyzed once per content hash.
- Auto-fill on attach: when an audio file is attached and the track's
  BPM or Key is empty, analysis fires-and-forgets and writes the result
  only if confidence clears the threshold (BPM ≥ 0.7, Key ≥ 0.6).
- Manual **Analyze audio** button in TrackEditor (Wand2 icon) opens
  `AnalyzeResultDialog` for per-field accept with a "Replace existing"
  toggle; low-confidence results display a `⚠ Low` prefix.
- Smoke assertion 21: `/api/tracks/:id/analyze` response shape +
  duration sanity check against the fixture WAV.

### Changed

- BPM detector uses `hop_length=256` (default `512` quantized to ~3 BPM
  steps near 120); fixture click track now detects 120.19 BPM.
- Major keys render with sharp notation, minor keys with flat notation,
  matching the existing Splice-style `KeyPickerPopover` convention.

### Migration

- Adds `migrations/007_analysis_cache.sql` (applied automatically on
  startup). Cache rows CASCADE on asset delete.

### Notes

- Sync API for MVP; expect 5–15s blocking on real 3-minute tracks
  (async upgrade deferred to a future v0.x patch).
- Krumhansl-Schmuckler is weaker on modal/atonal hip-hop; BPM
  half-time/double-time errors are common on heavy 808 trap (~10%).
  Both are user-overridable via the per-field accept dialog.
- Smoke fixture is silence → analyze returns `bpm=0, conf=0`; only the
  API contract is validated, not algorithm quality.

## [0.0.12.2] - 2026-05-16

### Fixed

- `ChipMultiSelect` with `maxSelections=1` now renders as a single-select
  dropdown trigger (showing the current value) instead of an empty
  chip-bar with a `+` button.
- Multi-select chips render slightly larger for easier hit targets.

## [0.0.12.1] - 2026-05-16

### Added

- `maxSelections` prop on `ChipMultiSelect` — caps how many values can
  be picked, with the picker disabling additional options at the cap.
  Wired into TrackEditor where appropriate.

## [0.0.12] - 2026-05-16 — Multi-Value Tags + Native Drag-Out

### Architecture

- `producer`, `genre`, and `mood` become **JSON arrays** stored in TEXT
  columns (not separate join tables). Singular values from prior
  versions are migrated idempotently into single-element arrays.
- Filtering uses `EXISTS (SELECT 1 FROM json_each(...) WHERE value IN
  (?,?))` — "any match" within a field, AND across fields preserved.
- Sorting uses `json_extract($[0])` — first-element sort (acceptable
  trade-off for multi-value fields).
- Platform vocab mappings live in `packages/beatos-platforms/<platform>/
  {genre,mood}-map.json`; currently empty (identity) stubs, ready for
  the publish-to-platform adapters in v0.1+.

### Added

- `ChipMultiSelect` component (Radix Popover) — reusable multi-value
  picker; Producer allows custom-add, Genre/Mood are vocab-only.
- `genres.ts` (74 entries) and `moods.ts` (50 entries, positive /
  neutral / negative groupings) renderer vocab files seeded from
  `conventions/vocab-genre-mood-scene.md`. English `en` is the
  canonical stored key; Chinese `zh` is display-only.
- Native cover drag-out from TrackEditor's 200×200 cover: drag the
  cover into Finder / another app and the underlying file is dragged.
  Backed by `webContents.startDrag` via a new `DRAG_OUT_FILE` IPC.
- `packages/beatos-platforms/` workspace package with stub
  genre/mood maps for future platform adapters.
- Smoke assertions 18–20: genre chip pick, producer custom-add round
  trip, cover drag-source attribute presence.

### Changed

- `/api/tracks` request/response widens `producer` / `genre` / `mood`
  to `list[str]`; renderer API types updated accordingly.
- TrackEditor swaps the three legacy single-value inputs for three
  `ChipMultiSelect` pickers.
- TrackDetailPanel (right "Now Focused" pane) renders multi-value
  genre/mood as comma-joined display.

### Migration

- Adds `migrations/006_multi_value_tags.sql` (applied automatically on
  startup). Backfills existing `producer` / `genre` / `mood` strings
  into single-element JSON arrays.

### Notes

- Drag-out is intentionally limited to the TrackEditor cover (not
  Library row covers) to avoid disturbing the dnd-kit drop targets.
  Path validation rejects relative paths, traversal, and missing files.
- Producer custom-add: typed in the popover, persisted on Save; other
  tracks see the new producer in their picker's distinct list on next
  load (distinct endpoint pulls from `json_each`).
- BeatStars / Airbit platform vocab not yet researched — future work
  follows the same intake → `conventions/vocab-*` → platform-stub
  pattern used for NetEase.

## [0.0.11.3] - 2026-05-16

### Fixed

- VirtualTrackList scrollbar gutter alignment: outer scroll container
  reserved a 15px gutter on macOS "Show scroll bars: Always" mode, making
  rows narrower than `TableHeader` (which lives outside the scroll
  container). Applied `beatos-scroll` class to hide the gutter — same
  pattern used by `TrackDetailPanel` / `TrackEditor` / `SettingsPanel`
  since v0.0.11.1.
- Title column could not shrink below ~160px when resizing — lowered
  `MIN_WIDTH.title` from 160 → 80.

## [0.0.11.2] - 2026-05-16

### Fixed

- Library row columns still misaligned after v0.0.11.1: `TableHeader`'s
  flex container lacked the `gap-3` class that `TrackRow` had, producing
  ~120px cumulative drift across 10 children. Added matching `gap-3`.
- Column resizer was invisible (`w-1`, hover-only highlight) and drag
  direction felt inverted. Rewrote as 12px hit area with always-visible
  1px inner line that highlights on hover/active.
- Play button now lives on the cover thumbnail: cover wrapper is a
  `relative group w-12 h-12` containing `CoverImage` + `TrackRowPlayButton`
  with a dark scrim on row hover (or always when current track). Removed
  the standalone play column from both `TrackRow` and `TableHeader`.
- `togglePlay` no-op'd when the current track was in `error` or `idle`
  state — now retries via `loadAndPlay` so the row play button recovers
  the player after a failed load.

## [0.0.11.1] - 2026-05-16

### Added

- User-resizable column widths in the Library list via drag handles
  between adjacent columns (`useColumnWidthStore` + `<ColumnResizer>`).
  Widths are session-scoped, not persisted.
- Unsaved-changes dialog in TrackEditor (`shallowEqualEditable` dirty
  tracking + `<UnsavedChangesDialog>` with Save / Discard / Cancel).

### Changed

- All Library columns left-aligned.
- Inner panels (`TrackDetailPanel`, `TrackEditor`, `SettingsPanel`) hide
  the macOS scrollbar gutter via a new `.beatos-scroll` CSS class.

### Fixed

- TrackEditor render crash exposed during smoke hardening: `useBlocker`
  from react-router-dom v6 requires a data router (`createHashRouter` +
  `<RouterProvider>`), but the app uses the component-based `<HashRouter>`
  API. Replaced `useBlocker` with manual `dialogOpen` state +
  `handleNavigateAway()` checks at each navigation exit (Cancel, ESC).
  This had been silently breaking the editor since the unsaved-changes
  work landed.

## [0.0.11] - 2026-05-16 — Library Table Redesign

### Added

- `/api/tracks` gains `sort_by` / `sort_dir` / per-field filter params
  (Producer, Genre, Mood, Key, BPM range, `has_audio`) plus a new
  `/api/tracks/distinct/{field}` endpoint feeding the chip-bar pickers.
- `useTrackQueryStore` (renderer) drives sort + filter state and pushes
  updates to `useTrackStore.refresh()` via a single subscribe wire.
- Sortable `TableHeader` component — click toggles asc/desc, single
  active column, with sort-direction indicator.
- Top filter chip bar (`FilterChipBar` + `FilterFieldPopover`) with
  `+ Add filter` button; AND across fields, OR within a multi-value
  field. Sidebar Source/List remains the primary filter; chips narrow
  further.
- `formatRowDate` + `formatChipLabel` formatters with unit tests.
- Two new smoke assertions: filter chip add/remove, sortable header
  round-trip.

### Changed

- TrackRow rebuilt as a 2-line layout: title on top, Producer subtitle
  underneath; cover thumb bumped 40 → 48px; new Updated column showing
  absolute `YYYY-MM-DD` (chosen over hybrid/relative formats).
- `VirtualTrackList` `ROW_HEIGHT` 48 → 64 to accommodate the 2-line row.
- Default sort: `updated_at DESC` for library/source views;
  `list_track.position ASC` preserved for list views via a sentinel
  `sort_by=None` so the route can distinguish "client omitted sort_by"
  from "client passed sort_by=updated_at".

### Notes

- Radix has no nested popovers — `FilterChipBar` uses a single Popover
  with two views (`field-list` / field picker) controlled by local state.
- Sort field names are whitelisted against `SORTABLE_FIELDS` /
  `DISTINCT_FIELDS` before f-string interpolation; values stay
  parameterized. No injection.
- Column widths and sort/filter state are session-scoped — consistent
  with project no-persistence pattern (player state also session-only).

## [0.0.10] - 2026-05-16 — TrackEditor Refactor

### Added

- `KeyPicker` + `KeyPickerPopover` (Splice-style): Flat / Sharp tabs,
  note grid with alteration row above naturals, parallel Major / Minor
  buttons, Clear + Close. Replaces the plain `<input>` for `key_signature`.
- `CoverDropZone` 200×200 — noticeably larger than the previous
  aspect-square slot; cover thumbnail no longer disappears after import.
- Row-based audio file UI (`useAssetSlot` hook + `AudioFileRow` +
  `FileRowsSection`): full-width section with 5 rows (4 audio roles +
  Stems), each showing role label · filename · filesize · hover actions.
  Empty audio rows always render with "+ Add file" for discoverability.
- `formatBytes`, `parseKey`, `formatKey` helpers + unit tests.
- Radix Popover primitive (`components/ui/popover.tsx`).
- Smoke assertion 13: KeyPicker round-trip (open · pick · close · reopen).

### Changed

- TrackEditor switched to a 2-column grid: 200px cover on the left,
  existing form fields (Title, BPM/Key/Genre, Mood/Producer/License,
  Tags, Description) on the right, full-width file rows below.
- Editor max width bumped `max-w-3xl` → `max-w-4xl` for breathing room.
- `key_signature` storage still `TEXT`, but new values are normalized
  on save to `"F# minor"` / `"Eb major"` format. Legacy values like
  `"F#m"` or `"Cmaj"` are preserved until the user commits a fresh pick.
- Partial selections (note without mode) are discarded on Close — no
  half-state ever reaches the DB. No default mode; Major or Minor must
  be picked explicitly.

### Removed

- `FilesSection` component + its test (superseded by `FileRowsSection`).

## [0.0.9.1] - 2026-05-16

### Fixed

- Resume-after-end playback: when a track played to its natural end with
  repeat off, clicking play in the bottom bar flipped the icon but audio
  stayed silent and the progress bar froze. `BottomPlayerBar` now resets
  `audio.currentTime = 0` before `play()` when the element is `ended`.
- Smoke regression (assertion 12) added: wait 5s WAV to end, click play,
  assert `data-playing="true"` returns. 3-run stable.

## [0.0.9] - 2026-05-16 — Audio Playback

### Added

- Spotify-style bottom player bar with a singleton `<audio>` element
  managed by `usePlayerStore` (Zustand). Transport: Play/Pause/Prev/Next
  + Seek + Volume + Mute + Shuffle + Repeat.
- Role switcher in the player bar — pick between the 4 audio variants
  (`tagged_wav` / `untagged_wav` / `tagged_mp3` / `untagged_mp3`).
  Default priority: `tagged_wav > untagged_wav > tagged_mp3 > untagged_mp3`.
  Role-switch replays from start.
- Per-track `producer` column (migration 005) + producer field in the
  Track Editor. Player-bar subtitle renders `producer · BPM · Key` with
  em-dash placeholders for nulls.
- Queue = snapshot of the visible view at play-start (All Beats / Source
  / List / Search results). Does NOT auto-update on navigation.
- `Track.has_audio` derived field via `_has_audio_subquery`, wired into
  `service.py`, `lists/membership.py`, AND the `beatos_http` source-filter
  route. Track rows render a play button per row; rows with no audio show
  a disabled button with title "No audio asset".
- Sidecar route `GET /api/assets/audio/{id}` via FastAPI `FileResponse`
  (native HTTP Range support).
- `beatos-asset://audio/{asset_id}` custom protocol with Range header
  forwarding (mirrors existing `beatos-asset://cover/{asset_id}`).
- `audio-resolve.ts` resolver applying the role-priority rule.

### Changed

- `AppShell` becomes a flex-column with the player bar as
  `flex-shrink-0` at the bottom.
- Production CSP in `index.html` gains `media-src beatos-asset:`
  alongside existing `img-src beatos-asset:` — without this the built
  app silently failed to play audio (dev had a loosened CSP).

### Notes

- No persistence across restarts; no global Space shortcut (out of scope).
- 134 sidecar pytest / 85 vitest / 11 smoke assertions (was 125 / 55 / 8).
- A stuck-at-end playback bug surfaced post-ship and is fixed in v0.0.9.1.

## [0.0.8.1] - 2026-05-16

### Added

- Sidebar right-click context menu on Source and List rows: Rename
  (inline input; Enter commits, Escape cancels, blur commits) and Delete
  (confirm dialog built on `dialog.tsx` primitive).
- Settings "About" credit section: "Made by averatec0773" plus link
  buttons to `https://averatec.studio` and
  `https://github.com/averatec0773/beatos`. Buttons carry `aria-label`
  for screen readers.
- New IPC channel `SHELL_OPEN_EXTERNAL` with http(s)-only guard in the
  main handler; preload exposes `window.beatos.openExternal(url)`.

### Changed

- Splash window minimum display time 600ms → 1000ms, with a 250ms fade-out
  (`fadeOutAndClose`: 10 × 25ms `setOpacity` steps). Main window shows at
  fade start for a crossfade effect.
- `TopBar.tsx` `<header>` gains `WebkitAppRegion: "drag"`; all interactive
  children (BeatOS button, Settings, SearchInput wrapper) get `no-drag`.
  Fixes the macOS dead-zone where `titleBarStyle: "hiddenInset"` only
  provided 78px of draggable inset for traffic-light buttons.
- Source delete copy clarifies behaviour: "Your tracks and files stay
  where they are — only BeatOS's registration is removed." List delete
  copy: "The list is removed but member tracks stay in your library."
  Active-filter / active-list auto-reset after delete.

### Fixed

- Rename-on-blur inconsistency with "Add list" (which commits on blur):
  sidebar rename now also commits on blur via a `committedRef` guard.
- `DeleteSidebarItemDialog` was rendered inside a dead `renaming`
  branch — hoisted out.

## [0.0.8] - 2026-05-16 — Splash + Sidecar Fail-Fast

### Added

- Branded launch splash window: logo + "BeatOS" + "by averatec0773" +
  3 pulsing dots on dark `#121212` with violet `#7c5cff` accent.
  480×320 frameless transparent `BrowserWindow`, sandboxed,
  `hasShadow: true`. HTML inlined as a `data:text/html` URL — no
  separate asset file, no dev/prod path divergence. Icon read from
  `resources/icon.png` (dev: `app.getAppPath()`; prod:
  `process.resourcesPath`) and inlined as base64 at boot.
- 600ms minimum display floor (`splashShownAt` refined to the actual
  `ready-to-show` timestamp); splash closes on the main window's
  `ready-to-show` event, not a fixed timer. No splash on macOS dock-icon
  reopen.
- `--no-splash` CLI flag (first non-`--smoke` flag in main); used by the
  smoke harness.
- `assertSidecarLayout(repoRoot, dirname)` — fail-fast `pyproject.toml`
  existence check before `spawn`. Replaces a 5s silent handshake hang
  with a clear error if the electron-builder layout drifts. Lives in
  `apps/desktop/src/main/sidecar-helpers.ts`.
- Pure helpers `shouldShowSplash` + `closeDelayMs` unit-tested (6 tests
  in `splash.test.ts`); 2 unit tests for the sidecar-layout assertion.

### Changed

- Smoke harness: all 5 hardcoded `waitForTimeout` sleeps replaced with
  Playwright `waitForSelector` (navigation-safe) for DOM checks and
  native Node `while`-loop polling for the API-membership check (avoids
  "Execution context was destroyed" after post-drag navigation).
  Drag-drop poll predicate tightened to `=== 1` (was `>= 1`).
- Smoke now cleans `userData` by default; `--keep-userdata` opt-in for
  debugging — no more `/tmp/beatos-smoke-*` accumulation.
- New smoke assertions: double-click on a track row opens the editor
  (`[data-track-editor]` selector); `app.windows().length === 1`
  immediately after `firstWindow()` verifies `--no-splash`.
- Honest current-state comment on the MCP server (was a stale
  "full surface arrives in v0.0.5" promise).

### Fixed

- Graceful degradation when the splash icon is missing:
  `createSplashWindow` returns null and warns instead of crashing boot.
- Sidecar bootstrap failure path: splash is closed + an error dialog is
  shown + the app quits cleanly (no orphaned splash window).

### Removed

- Empty stub packages `packages/beatos-core/beatos_core/adapters/` and
  `packages/beatos-core/beatos_core/automation/` (both v0.0.2 stubs
  that never landed).

### Notes

- 115 sidecar pytest (unchanged) / 55 vitest (was 47: +2 sidecar-assert
  + 6 splash) / 8 smoke assertions (was 7).
- 3 consecutive smoke runs PASS — predicate-based replacement of sleeps
  eliminated flakiness.

## [0.0.7] - 2026-05-16 — Cover Wiring + Audit Cleanup

### Added

- `Track.cover_asset_id` field surfaced end-to-end. All Track SELECT
  queries (list, get, create+refetch, list-membership, source filter)
  gain a correlated subquery against `asset` (role='cover'). No schema
  change — `UNIQUE(track_id, role)` already enforces 1-to-1.
- Helper `_cover_subquery(prefix)` so callers control the outer alias.
- Smoke harness asserts `track.cover_asset_id` populated and
  `<img src="beatos-asset://cover/N">` actually renders in the row.
- Smoke harness gains a structural drag-handle check: handle bbox
  width must be <50% of row width (catches `{...listeners}` slipping
  back onto the row body, the bug class from v0.0.6).
- Smoke `postJson` helper surfaces status + body for any failed seed
  call (was a `drag-drop assertion section error: ...` catch-all).

### Changed

- Frontend `TrackRow` reads `t.cover_asset_id` directly; the
  `coverIdFor` stub is gone.
- `TrackDetailPanel` placeholder copy: "No platforms wired yet
  (v0.0.4+)" → "No platforms wired yet."
- Drag handle now lives on the cover only; row body keeps a clean
  click + double-click surface.
- Smoke drag uses explicit mouse stepping on the cover handle —
  Playwright's `dragTo()` skips intermediate positions.
- MCP config drops `local-logs-mcp-server` from
  `.claude/settings.local.json` and the example; `npm run logs:tail`
  already covers it. `@robertn702/playwright-mcp-electron` stays.

### Fixed

- Malformed JSONL log lines in smoke assertions are now counted as
  failures (was silently dropped).
- Smoke `isVisible()` check before driving drag prevents flaky races.

### Removed

- `moveToManaged` purged across the chain: `move_managed.py` module,
  `/api/tracks/:id/assets/:id/move` route, frontend
  `assets.moveToManaged`, and `test_move_managed_returns_501`.
- Stale "phantom future work" docstring on `_on_new_file_in_source`.

### Notes

- Test totals after: 115 sidecar + 47 renderer + 7 smoke assertions,
  all green.
- No `v0.0.7` git tag was cut; release commit is `f28790e` on
  `origin/main`.

## [0.0.6] - 2026-05-16 — Drag-Add Lists + Production-Bug Sweep

### Added

- **Drag-drop List membership** via `@dnd-kit/core` ^6.3.1 (chosen
  over HTML5 native because Playwright `_electron` cannot drive
  native drag). `DndContext` mounts at `App.tsx`; `DragOverlay`
  renders a ghost for single drag or a "N tracks" pill for multi.
- Drop targets are sidebar user-List rows only (All Beats and Sources
  reject drops).
- Multi-select state in `useTrackStore`: `selectedIds: Set<number>` +
  `anchorId` for range selection. Click modifiers: plain = replace,
  cmd/ctrl = toggle, shift = range from anchor. Dragging an
  unselected track switches selection to that one (Finder behavior).
- `EmptyState` component as a discriminated union with three variants:
  `no-tracks`, `empty-list`, `no-search-results`. `TrackListPanel`
  picks the variant by route + search-query state.
- Smoke harness extended to drive the v0.0.6 drag flow end-to-end via
  `dragTo()` + API verification.

### Changed

- Accent `#7c5cff` (purple) is now docs-locked across
  `design-direction.md` — the `--accent: TBD` placeholder is gone.
- Docs sync across `CLAUDE.md`, `architecture.md`, `testing.md`, and
  `design-direction.md` to reflect v0.0.4.1–v0.0.6 reality.
- Backend: existing `POST /api/lists/:id/tracks` is idempotent via
  `INSERT OR IGNORE` — no new routes were needed for multi-add.

### Fixed

The smoke harness drove the built renderer for the first time and
surfaced four bugs that had been silently present since v0.0.1 /
v0.0.4. Each would have been catastrophic for any production user:

- `BrowserRouter` on `file://` URLs matched no routes, so production
  builds rendered an empty React tree. Switched to `HashRouter`. Dev
  mode masked this because electron-vite served from `http://`.
- Sidecar CORS allow-list missed the `file://` origin (`Origin: null`)
  — renderer fetches threw `TypeError: Failed to fetch`. Replaced
  with `allow_origin_regex=r".*"` (safe: sidecar binds 127.0.0.1).
- Electron's `resolveDbPath()` ignored `process.env.BEATOS_DB_PATH`,
  so smoke harness DB isolation silently wrote into the user's real
  `~/Music/BeatOS/global.db`. Now honors caller env var first, then
  config, then default. (Same class as the v0.0.5 `BEATOS_LOG_PATH`
  fix.)
- `WelcomeScreen` was a dead-end if Sources appeared via a non-UI
  mechanism — it never refreshed or redirected. Added a `useEffect`
  on mount to refresh sources, and another on `all.length > 0` to
  navigate to `/`.
- Main process now parses `INFO:` / `WARNING:` / `ERROR:` prefixes
  from uvicorn stderr instead of tagging every line as an error.

### Notes

- Do not switch to HTML5 native drag — Playwright `_electron` cannot
  test it.
- Do not fall back to `BrowserRouter` in this Electron context.
- The CORS regex stays open until we have a production threat model.

## [0.0.5] - 2026-05-15 — AI Dev Loop

### Architecture

- Introduces a self-verifiable dev loop so the agent can boot the
  app, drive UI, and read logs without user click+screenshot
  ping-pong. The agent's claim "I fixed it" can now be checked
  against the running binary before handing back to the user.
- Builds on the v0.0.4.1 foundations (stdio capture, crash broadcast,
  IPC constants, boot integration test).

### Added

- **Structured sidecar logging** via `structlog` +
  `asgi-correlation-id`: one JSON per line at
  `apps/desktop/logs/sidecar.jsonl`, including `level`, `ts`,
  `event`, and `request_id`. Production writes to
  `~/Library/Logs/BeatOS/`.
- Main process passes `BEATOS_LOG_PATH` to the spawned sidecar in
  dev so logs land under `apps/desktop/logs/`.
- npm scripts (in `apps/desktop/`):
  - `npm run dev:fresh` — kill orphans, free ports 5000–5050, clear
    logs, then `npm run dev`.
  - `npm run smoke` — Playwright `_electron` against the built app
    (run `npm run build` first). Exits 2 if `out/main/index.js`
    missing, 1 on failure, 0 on pass. Writes a screenshot to
    `logs/smoke-<ts>.png`.
  - `npm run logs:tail` — human-friendly tail of both log files.
  - `bash scripts/dev-reset.sh` — reset only, no dev start.
- Playwright `_electron` smoke harness that boots the built app and
  asserts boot + absence of sidecar errors in JSONL.
- MCP server templates in `.claude/settings.local.json.example` (not
  auto-installed — user opts in by copying the file):
  - `playwright-electron` (`@robertn702/playwright-mcp-electron`) to
    drive the running app, screenshot, evaluate.
  - `local-logs` (`local-logs-mcp-server`) to tail JSONL and filter
    by level.
- Tests: `test_logging_config.py` (2 tests on JSONL output +
  idempotency) plus extension to `test_boot_integration.py`
  asserting JSONL output from the real subprocess.

### Changed

- `tsconfig.web` gains `vitest/globals` so test files typecheck
  under `npm run build`.
- `.gitignore` excludes TypeScript composite `tsbuildinfo` artifacts.
- `CLAUDE.md` stack note bumped to Electron 39 + Radix UI +
  `structlog`; clarifies Playwright is `_electron`, not CDP.

### Fixed

- Main honors `BEATOS_LOG_PATH` from caller env instead of
  overriding (needed for smoke harness and tests).

### Notes

- The standard agent loop is now: `npm run dev:fresh` (background)
  → edit code (electron-vite restarts main, uvicorn `--reload`
  restarts sidecar) → read `logs/sidecar.jsonl` for errors → use
  `playwright-electron.browser_snapshot` to verify renderer UI → on
  milestone, `npm run smoke`.

## [0.0.4.1] - 2026-05-15

### Added

- Electron main captures sidecar stdio + `electron-log` to
  `apps/desktop/logs/main.log`; sidecar stderr is tagged
  `[sidecar]`. Adds `electron-log` 5.x dependency.
- IPC channel string literals extracted to a shared constants
  module (`src/shared/ipc-channels.ts`).
- `sources.loadError` flag distinguishes API failure from "no
  sources" — drives `<ApiErrorState>` vs the `/welcome` route.
- Sidecar crash broadcast to renderer; `cachedBase` invalidated on
  network error so the renderer reconnects cleanly after a sidecar
  restart.
- Boot integration test (`test_boot_integration.py`) spawning a real
  sidecar subprocess and asserting handshake + `/api/health`.

### Fixed

- `resolvePathFn` requires a `PathVariables` arg per electron-log
  types (caught at typecheck after the electron-log integration).

### Notes

- This entry was previously rolled into v0.0.5; split out
  2026-05-17 (during backfill) to match the actual `v0.0.4.1` tag
  scope. v0.0.5 (same-day ship) layers structured JSONL logging,
  the smoke harness, and dev scripts on top of these foundations.

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
