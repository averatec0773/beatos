# Changelog

All notable changes to BeatOS will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); BeatOS uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html) starting at `0.0.1`.

## [Unreleased]

## [0.0.49] — 2026-06-16 — Web frontend, Pro publishing + Publish Center, bilingual UI, playlist export, FLAC

### Added

- **Web frontend (experimental).** The renderer now also builds as a browser SPA served by the local sidecar — so BeatOS runs cross-platform (incl. Windows) without an Electron build, sharing the same backend and a near-identical UI. One renderer codebase, two build targets: Electron-only capabilities route through a `platform` seam, and WAV sanitization moved server-side so browsers decode DAW WAVs. Covers library / search / playback / metadata editing, plus file I/O: add audio/cover by browsing your own filesystem (a local file-browser dialog, same linked-mode result as the desktop), reveal/open in Finder, and download — all driven by the sidecar on your machine. (Drag-in of OS files stays desktop-only; remote access is a future step.)
- **Bilingual UI (English / 中文).** The desktop interface is now fully translatable. Settings → General → **Language** switches the whole UI (default English); a separate **Tag display** control (English / 中文 / Bilingual) governs how genre/mood tags render, independent of the UI language — replacing the old, ambiguous "中文 (English)" toggle. Built on i18next with English as the authoritative catalog and Chinese authored alongside (key-parity + no-hardcoded-Chinese guard tests); dates and relative-time localize via `Intl`. Genre/mood vocab and platform-native export labels (NetEase / 抖音) keep their existing bilingual / platform structure.
- **Platform publishing (Pro).** Publish beats to platforms straight from BeatOS — the engine drives a real browser and pauses at the platform's human verification step. Available in the Pro build (private `packages/pro/` submodule); the free build greys it out.
- **Publish Center dashboard (Pro).** A sidebar entry below All Beats shows per-platform login/session health — backed by a real headless validity check (run in parallel across platforms, racing the logged-in vs logged-out markers so a valid session resolves in seconds instead of waiting out a fixed timeout; cached ~24h to avoid hammering the platform; a transient failure shows *status unknown* and keeps the last result rather than falsely flagging the session expired), not just whether a saved-session file exists — with an in-app **Log in / Re-login** button that opens the browser to log in (no more terminal command), a **Publish a track** action (searchable picker → publish dialog), and a live view of in-progress publishes that surfaces the "finish it in the browser" hand-off (short-code / final submit). Real-time only (no history persistence). The free build shows the entry as a locked Pro upsell.
- **抖音 promo-video publishing (Pro).** Attach a 伴奏宣传 (promo) video to a track — new **Promo 9:16 / 16:9 / 1:1** slots in the Files section — and publish it to 抖音 from the Publish Center with a templated 文案 (作品标题 / 简介 / `#话题`). The engine logs in (saved session), uploads the video, fills the form, then holds the browser for you to click 发布. Free build greys it out.
- **`make dev-pro`.** One-command dev launch with the private Pro engine installed (`uv sync` → install engine → electron-vite dev), so Publish Center is enabled without re-running the post-sync install each time (`make dev`'s `uv sync` prunes the engine).
- **One-click launchers.** Double-click `start-beatos.bat` (Windows) or `start-beatos.command` (macOS) at the repo root to run BeatOS without touching a terminal: missing dependencies (uv, Node ≥22) auto-install, first launch runs `npm install` + `uv sync`, then a menu offers the browser app (default) or the desktop app. The browser app opens as a chromeless app window (Edge/Chrome `--app=`, falling back to a normal tab), skips the SPA rebuild when the checkout hasn't changed, reuses an already-running instance, and self-heals from orphan sidecars locking the venv; when the Pro submodule is mounted the publish engine is (re)installed automatically, mirroring `make web-pro`.
- **Project folder per track.** The track editor's Files section gets a 工程文件夹 row — set a path to the beat's DAW project folder, then open it in Finder. Stored on the track (`project_path`).
- **Loop file role.** Tracks can carry a dedicated `loop` audio file (for loop-only producers); it's playable, analyzable, and counts toward "has audio" like the other audio roles.
- **Playlist export.** A list can be packaged for sending out (beat pack for a singer, a loopkit): pick per-track and per-file what to include (with bulk-select by type — all WAVs, all MP3s, etc.), then export as a **ZIP** or a **plain folder copy**, one subfolder per track.
- **Playlist inline rename.** A playlist hero now has a rename affordance (pencil / double-click), not just the right-click menu.
- **Aurora backdrop.** A second ambient backdrop joins the ASCII glyph-rain — an animated WebGL gradient field (violet, made in Unicorn Studio). Settings → Appearance → Background gains a style selector (**Aurora / ASCII / Off**), with Aurora the default. The runtime + scene are bundled into the app, so it runs fully offline (no network, no CDN); reduced-motion falls back to the plain dark base.
- **Animated search orb.** The search box's icon is a glowing WebGL plasma orb (Unicorn Studio) that brightens on focus, and the placeholder hint dissolves toward the right; the bar is taller with the box vertically centred in the top bar (which now insets its left edge only on macOS, for the traffic lights). Reuses the aurora backdrop's bundled runtime, so it stays fully offline; reduced-motion / GPU-less hosts fall back to a static gradient orb.
- **Backdrop easter egg.** A small fraction of the ASCII glyph-rain columns spell a producer tag instead of random glyphs (editable list in `AsciiBackdrop.tsx`).
- **MCP `search_tracks` pagination.** The agent-facing search tool now accepts an `offset` (mirroring `list_tracks`), so an MCP client can page through result sets larger than `limit` instead of being capped at the first page.
- **One-click MCP client setup.** Settings → AI Integration can now install the BeatOS MCP bridge for Claude Desktop, Claude Code, or Codex directly: Claude Desktop and Codex config files are merged in place with `.beatos.bak` backups, while Claude Code is registered through `claude mcp add`. The README and MCP package docs now mirror those client-specific setup paths for first-time users and AI agents.
- **Agent permission policy.** A single Settings → AI Integration control governs how MCP write tools are gated, with three modes (mirroring an AI coding agent's permission modes): **Confirm every action** (default — every agent write waits for your approval in Agent Actions), **Auto-approve all** (writes apply immediately — switching it on requires confirming a warning, and a persistent banner reminds you it's active), and **Read-only** (agent can read but not write). Auto-approved writes are still recorded in the Agent Actions history, so nothing the agent does is invisible.
- **MCP publish tools (Pro).** Agents can now drive a publish responsibly up to the human gate: `list_publish_platforms`, `publish_session_status` (is the platform logged in?), and `list_publish_jobs` (recover an in-flight publish), plus `publish_track` gained a `dry_run` rehearsal, buyer-deliverable WAV/stems inputs, and platform validation. `publish_track` now also obeys the permission policy — under Confirm mode the browser opens only after you approve in Agent Actions, closing the one agent write that previously bypassed the approval gate. Publish job status now persists, so an in-flight publish survives a sidecar restart and `list_publish_jobs` can recover it.
- **Demo track on first launch.** A brand-new, empty library now seeds one ready-made beat ("REGALIA" — cover, tagged MP3, BPM/key/genre/mood, and an MP3 license tier) so the app isn't blank on first run. It seeds only when the library is empty (an existing user upgrading is never touched) and only once — deleting the demo doesn't bring it back. The bundled audio + cover are copied into `~/Music/BeatOS/demo/` so the linked files survive app updates.
- **FLAC support — audio format decoupled from role.** The audio file format (now **WAV / MP3 / FLAC**) is a separate attribute of an asset rather than being baked into its role. A track can hold the same slot in multiple formats, and agents attaching audio over MCP accept `.flac` too. FLAC is kept out of the editor's default slots (it's rare in practice) — add it per-track on demand via **+ Add format**, and an already-attached FLAC reveals its slots automatically. Adding another format later is a one-line change, not a new role across every layer.
- **Backdrop opacity.** Settings → Appearance → Background gains an **Opacity** slider that fades the active backdrop (Aurora or ASCII) toward the dark base, alongside the existing style / intensity / speed controls.

### Changed

- **Number inputs lose the hover spinner arrows.** Price, BPM, revenue-share and BPM-range fields no longer sprout the native up/down stepper on hover/focus (none of them are nudged by stepping) — a single global rule strips the spinner across every `type="number"` field while keeping numeric-keypad and validation behaviour.
- **Refreshed first-run defaults.** A fresh install now starts with more-opaque panels and a slightly dimmed backdrop (Panel opacity 80 · Background opacity 80 · Aurora), a ready-made upload-template set (album/beat naming + a license blurb, `{prod}` placeholders), a default MP3 / WAV / STEMS license-tier template, and new tracks marked free by default. Existing settings are never touched — these apply only when you've never configured your own.
- **Unified, on-brand popups.** Confirmations and error notices no longer fall back to the raw OS `confirm()`/`alert()` chrome — they go through the app's own styled system. Modal dialogs now wear the translucent floating-card look (matching the rest of the UI) instead of a plain box, every confirmation shares one shell with a consistent Cancel · primary layout (a single danger style for destructive actions), and the handful of `alert()` error popups (file attach/relocate, drop-wrong-type, DB-path change) became normal toasts. Reversible single-track deletes now act immediately with Undo (no confirm prompt at all); only irreversible actions (emptying Trash, removing a producer) and bulk delete still ask first — now in a styled dialog.
- **Trashing a track now offers Undo.** Moving tracks to Trash — from the bulk bar, a row, the right-click menu, or the editor — pops a toast with an **Undo** button that restores exactly what you just trashed (7-second window). Single-track delete from the list is now immediate-with-Undo instead of a blocking confirm dialog (the two inconsistent single-delete paths are unified); bulk delete still asks first, and the editor's delete keeps its confirm. The success toast now reports how many actually moved, not how many were attempted.
- **Visual refresh (subtle).** A small evolution of the existing look — same monochrome palette and ASCII backdrop, just airier and a touch more legible: softer card corners (12 → 16px radius), micro-labels set in JetBrains Mono to echo the terminal feel, slightly brighter secondary text, snappier hover transitions, and marginally more see-through panels by default (the Panel opacity slider in Settings → Appearance still overrides it).
- **Appearance pass.** A round of layout polish: the top-bar wordmark is now a brand lockup (waveform mark + **BeatOS**) that lines up with the macOS traffic lights; the bottom player floats as a rounded card like the three columns instead of a full-width bar pinned to the edge; outer margins and inter-card gutters are tighter (12 → 8px); and track rows no longer collide when a hovered row lifts beside the selected one — a small inter-row gap absorbs the hover lift. Performance: the Aurora backdrop renders at 30fps (imperceptible for a slow gradient field, ~half the GPU/compositing cost), and `backdrop-filter` is dropped entirely when Background = Off (nothing animated to blur).
- **Approvals → Agent Actions.** The MCP approval queue's sidebar entry + panel title were renamed so it's clear these are agent-initiated actions awaiting your approval (the old name didn't signal that). The sidebar order is now All Beats · Publish Center · Agent Actions · Trash. Route unchanged.
- **Track editor layout.** Files now sit directly under the metadata fields; tags + description moved to a bottom 备注 section.
- **MCP-created tracks inherit creation defaults.** The configured default license tiers + free flag (Settings) are now applied server-side on `create_tracks`, so a track imported by an agent over MCP lands the same catalog state as one created in the UI (previously those defaults were applied only by the renderer, so MCP imports came in with no license/price).
- **Bigger Lists "+" hit target.** The new-playlist button in the sidebar was hard to click; its tap area is enlarged.
- **Detail panel fits a medium window.** Tighter section gaps/dividers and a slightly smaller BPM/Key readout so the panel shows fully without scrolling.

### Fixed

- **Resuming the last track on startup no longer comes up empty — and a transient boot hiccup no longer wipes it forever.** A one-off failure to load the resume track at launch (e.g. a `linked` audio file whose external drive hadn't mounted yet) used to clear the saved resume point outright, so every later launch opened with the player empty and the seek waveform flat — masked by the bottom bar still showing your last-selected track, which read as "restored". Startup restore is now non-destructive: a transient load failure keeps the resume point and surfaces the track as retriable (press play to load it), and the pointer is cleared only when the track is genuinely gone.
- **Your saved audio-format preference survives the format decouple.** A format preference saved before WAV/MP3/FLAC were split out from the asset role (stored as `audio_tagged_mp3`) stopped matching the new variant-key form (`audio_tagged:mp3`) and was silently ignored — playback fell back to WAV regardless. The legacy value is now migrated on load, so your preferred format is honoured again.
- **The search box now closes when you click away.** Clicking outside the focused search box — especially a non-focusable region like empty space or the detail panel — didn't dismiss the box or its dropdown, because closing relied on the input's blur, which a non-focusable target never fires. A click-outside handler now closes it immediately.
- **The Title column no longer collapses when the table is narrowed.** On a fresh app, growing the right panel (or otherwise shrinking the middle column) squeezed the Title column down to nothing — until you happened to click a column-resize divider, which quietly froze it. The flexible title track now carries its minimum width from the first paint, so it stays readable without that click.
- **Expanding a collapsed side panel now animates.** Collapsing a panel glided shut but expanding snapped open instantly — the width transition lived only on the collapsed-rail state. Both side panels (library + detail) now ease open and closed symmetrically, while dragging the gutter to resize still tracks the pointer 1:1 (the transition is suppressed for the duration of a drag).
- **Agent-attached audio is usable again.** Attaching an audio file to a track over MCP (`attach_assets` with `role: "audio"`) stored a non-canonical role, so the file was invisible to playback, analysis, and download — the two-approval folder-import flow silently produced unplayable tracks. The role now resolves to the correct audio type by file extension, with the format tracked separately (see *FLAC support* above) — supported formats are `.wav` / `.mp3` / `.flac`; others are rejected up front.
- **MCP-attached audio appears in the player immediately.** After you approve an agent's audio attach, the bottom-bar format switcher now reflects the new file (and the library refreshes) without needing an app restart — previously the new format was invisible until relaunch.
- **MCP `ping` reported a stale version.** The version string was a hand-maintained literal that had drifted from the real release (stuck at `0.0.44`); it's now derived from the installed package metadata, so `ping` — and the sidecar's OpenAPI metadata — always report the actual version.
- **Producer names are matched case-insensitively.** "Metro" and "metro" used to be two separate producers (an agent over MCP would create the divergent casing). Writes now reuse an existing producer's casing on a case-insensitive match across every path (UI edit, bulk edit, MCP create). A one-time merge of existing case-variants is available at `POST /api/producers/normalize-case` (merges to the most-used casing; `{"dry_run": true}` previews).
- **Dropping a track into an empty playlist updates its cover immediately.** The cover mosaic / hero were keyed only on the list id, so a 0→1 membership change didn't re-fetch; they now track a membership version.
- **Coverflow no longer overlaps the title.** The magnified focused cover could paint over the track title (worst with a two-line Genre/Mood block) because the fixed-height stage was being compressed inside the flex column; it's now `shrink-0`.
- **Cover/focus no longer breaks when switching between a list and All Beats.** The focused track was kept stale across view changes, so the coverflow either rendered nothing or caught the focused cover mid-flight (floating off-center with an empty middle). The focused track is now reconciled against the new view (kept if present, else the first row auto-focuses), and the coverflow snaps to the new layout instead of animating covers across from their old slots.
- **Reopening from the macOS dock no longer leaves a dead app.** Closing the last window stopped the background sidecar but (per macOS convention) kept the app running; clicking the dock icon then opened a window with no working backend — empty library, every action failing, no error shown. macOS now keeps the sidecar alive while the app is hidden, and a dock reopen restarts it if it had stopped, so the new window always works.
- **The track editor no longer drops your last edit on exit.** A change made within the brief auto-save delay could be silently lost if you pressed Esc or clicked away before it saved (the exit-time flush stopped working after the first save of a session). Pending edits are now flushed on every exit path.
- **Sorting, filtering, or searching inside a playlist no longer dumps you into the whole library.** Clicking a column header, toggling a filter chip, or typing in search while viewing a playlist used to refetch the entire library while the playlist title and count still claimed the playlist. These now stay scoped to the playlist.
- **Deleting a non-empty playlist no longer leaves orphaned rows behind.** The cascade that removes a list's track memberships wasn't being enforced on that delete path, so stale membership rows accumulated in the database. Foreign-key enforcement is now enabled so they're cleaned up with the list.
- **Switching tracks while a large file is still loading no longer leaves a ghost track playing.** If you clicked a quick-loading beat while a big WAV was still decoding, the slow one could finish and take over the player — audio kept sounding under a frozen "paused" display, and pressing play layered a second track on top. The audio engine now ignores a load that's been superseded by a newer one.
- **The library is honest when the backend is unreachable.** A failed fetch used to collapse into the "no tracks yet — add your first" screen, which read as an empty library even when the Python sidecar was simply down. It now shows a clear "can't reach the backend" message with a Retry button (and a brief loading state on first load) instead.
- **The background sidecar is reliably stopped on quit.** The force-kill fallback never actually fired (it checked a flag that flips the instant the first signal is sent, not when the process exits), so a sidecar that hung on shutdown could linger as an orphan. It's now force-killed if it doesn't exit within the grace period.
- **Esc in the track editor no longer fires through dialogs and text fields.** Pressing Esc to close the analyze-result dialog (or while typing in a field) also ejected you from the whole editor in the same keystroke; it now respects a dialog that already handled the key and ignores Esc while you're in an input.
- **Errors show as in-app toasts instead of raw browser alerts.** Attaching/relocating a file, renaming/deleting/creating a playlist, and analyzing a track now report failures through the normal toast (consistent, dismissible, translated) rather than a blocking native `alert()` popup.
- **The editor's delete prompt no longer claims it's permanent.** Deleting a track from the editor moves it to Trash (restorable), but the confirmation said "this cannot be undone" — it now reads "Move to Trash?" so a safe action stops looking destructive.
- **The window has a minimum size.** Shrinking the window very small used to squeeze the track table toward zero width (the side panels don't shrink); the window now stops at a sane minimum.
- **The detail panel gets out of the way on a narrow window.** Below ~1024px wide it auto-folds to its slim rail so the track table stays usable (it would otherwise be crushed by the fixed-width side panels), and it restores your previous open/closed preference once the window is wide again — without overriding a panel you closed yourself.
- **A failed publish now actually looks failed.** The "publish failed" banner (and the expired-session / failed-job labels in the Publish Center) referenced a colour that didn't exist in the theme, so they rendered with no red tint at all; they now use the danger colour like every other error state.
- **Startup is more forgiving.** The desktop app now waits longer for the backend on a cold start (a first launch after an update, where dependency resolution runs before the server boots, no longer trips a spurious "couldn't start"), and it finds `uv` even when launched from the macOS Dock instead of a terminal (the minimal Dock environment used to break the sidecar spawn).
- **Windows file rows show the file name, not the full path.** An audio/cover file row derived its label by splitting the path on `/` only, so a Windows backslash path (`C:\beats\kick.wav`) rendered in full instead of `kick.wav`; it now splits on both separators.

### Security

- **Local MCP endpoint hardening.** The `/mcp` transport now requires a per-process token: the sidecar mints one, advertises it to the launcher via the handshake file, and the launcher passes it back as an `Authorization` header — so a stray local process can no longer reach the agent surface (it could before, with no auth). This matters most with Auto-approve on. The renderer and web SPA are unaffected (they use `/api/*`, never `/mcp`). Kill-switch: `BEATOS_MCP_DISABLE_AUTH=1`.
- **Web mode drops the `null` CORS origin.** When serving the browser SPA, the renderer is same-origin, so the `null` (file://) origin — only needed by a packaged desktop build — is no longer allowed. That closes a path where a local `.html` file opened in the browser could reach the unauthenticated `/api` surface (e.g. flip the agent-approval mode or read files via `/api/fs`). Desktop builds are unaffected.
- **Desktop `/api` agent-control endpoints now require a local token.** In the packaged desktop app the `null` (file://) origin stays allowed (the renderer needs it), which also let any `.html` the user opened defeat the human-in-the-loop gate — flip the agent permission mode or approve/reject pending agent actions. Those endpoints now require a per-process token the desktop renderer holds through the preload bridge (which a web page can't reach). No-op in web mode, where the SPA is same-origin and CORS already blocks cross-origin writes. Env: `BEATOS_API_TOKEN`.
- **`/api/fs` is disabled in the desktop app.** The whole-disk browse / download / open endpoints exist only for the browser file picker; the desktop uses native dialogs, so they're now switched off there (`BEATOS_DISABLE_FS_API=1`), removing a local file read / launch surface a file:// page could otherwise reach.
- **Tighter main-process input validation.** Renderer-supplied paths that reach a directory-create or config-write are now validated (absolute, no `..`) like the existing drag-out guard, and asset ids forwarded to the sidecar must be numeric — closing minor injection paths at the Electron trust boundary.
- **External links open only over `http(s)`.** The window-open handler that hands `target="_blank"` / `window.open` URLs to the OS (e.g. a published track's platform link surfaced by the Pro engine) now opens only `http`/`https` schemes, matching the existing `shell:open-external` guard — a `file://`, `smb://`, or other scheme can no longer be launched through it.

## [0.0.46] — 2026-06-02 — ASCII backdrop + waveform seek, floating top bar, panel opacity, player persistence

### Added

- **ASCII glyph-rain backdrop.** An ambient monochrome character field is painted behind the (now translucent) panels — texture in the gutters and behind the floating top bar, softened through the cards. Settings → Appearance controls it: on/off, intensity, speed, and **panel opacity** (0–100, drives the `--card-alpha` token live). Preferences persist across restarts (`beatos.appearance.v1`). Respects `prefers-reduced-motion` (static frame) and pauses while the window is hidden/blurred.
- **ASCII waveform seek bar.** The player's progress bar is now a fine monochrome waveform — the track's real silhouette (peaks from the decoded buffer), bright up to the playhead, with a gentle smoothed "breathing" from the live analyser while playing. It IS the seek control (Radix click/drag preserved).
- **Player remembers state across restarts.** Volume, mute, shuffle, repeat, preferred role, and a resume point (last track + position) persist (`beatos.player.v1`). On launch the last track reloads **paused at its position**; if that track or its audio file is gone it **falls back to idle** and clears the stale pointer.
- **Settings grouped** into Appearance / Beats & Upload / General.

### Changed

- **Floating top bar (Spotify-style).** The top bar's glass strip + bottom border are gone; `BeatOS`, back, and the centred search now float on the black canvas.
- **Translucent panels over the backdrop.** The three columns and single-pane routes render as translucent backlit-glass cards (`.beatos-card`); opacity is user-adjustable (see above).
- **Collapse keeps the gutter gap and rescales the middle.** Collapsing a side panel no longer removes the inter-card gap (it was supplied by the resizer element). The detail panel, when collapsed, now keeps a bordered rail with a `‹` expand chevron and a hover peek (slides in, fades a faint preview) instead of vanishing — reopen via the chevron, not only a row click.

### Fixed

- **Volume at minimum is now truly silent.** `volume = -∞ dB` was not reliably honoured by the gain, leaving playback at its last level; zero now also mutes.
- **A finished track keeps playing.** Auto-advance paused on the next track because the engine flips to `paused` before emitting `ended`; auto-advance now forces playback (manual Next still preserves play/pause).

## [0.0.45] — 2026-06-02 — UI redesign: monochrome → Spotify-style cards, Coverflow, collapsible sidebar

### Fixed

- **Asset detach/replace now cascades the analysis cache.** Removing or replacing a track's audio/cover went through a DB connection that never enabled `PRAGMA foreign_keys`, so the `analysis_cache` row's `ON DELETE CASCADE` silently no-op'd and orphan rows accumulated (same class of bug fixed for track purge in v0.0.31, missed on the asset path). `attach_asset`/`detach_asset` now enable the pragma.
- **Untouched new tracks no longer linger.** Hitting Add Track and then backing out without typing anything (or after a misclick) used to leave a junk "Untitled" row in the catalog; the editor now auto-discards a pristine new track on exit — ESC, Cancel, or just navigating away — when it has no real title, audio, metadata, or assets.
- **Cover images no longer reload on every view switch.** The `beatos-asset://` protocol served covers with `cache-control: no-store`, so every `<img>` remount (switching lists/views, the coverflow window sliding) re-fetched from disk and the cover visibly reloaded. Covers are immutable per asset id (replacing one mints a new id), so they're now cacheable; audio stays uncached.
- **Cover loads self-heal.** `CoverImage` previously stuck on the music-note placeholder forever after a single transient load failure (more likely during rapid switching); it now retries transient errors and resets when the cover changes.
- **Library column resize no longer drags the wrong way.** Widening a fixed column (BPM/Key/Genre) stole width from the flexible `title` track sitting to its left, sliding every column between them leftward — drag right, labels move left (a bug re-fixed several times). The `title` track is now frozen to its rendered px the moment a fixed-column resize starts, so only the trailing `updated` (1fr) absorbs. Verified at the layout level in a real browser and guarded by `TableHeader.resize.test.tsx`.
- **Selecting a track from the detail panel no longer highlights two rows.** Coverflow focus set `current` without collapsing the multi-select set, so the old row and the newly focused row both highlighted; it now also `selectOne(replace)`. The selected-row highlight and hover-float no longer stack either (hover effects apply to non-selected rows only).

### Changed

- **Audio analysis decodes each file once.** BPM and key detection previously decoded the whole audio file twice per analysis; both backends now expose a single `analyze()` that decodes once and computes both — roughly halves decode time on the heaviest operation in the app.
- **Bulk metadata edit batches its reads.** `bulk_update_tracks` pre-fetches all array-field columns in one `IN (...)` query instead of one SELECT per track (was 2N round-trips for an N-track edit).
- **Changelog split.** Pre-0.0.25 history (foundation → MCP write surface) moved verbatim to `CHANGELOG-archive.md`; this file now covers 0.0.25+. Also synced the `beatos-mcp`/`beatos-http` `__version__` strings to 0.0.44 (the MCP `ping` tool had been reporting `0.0.20`).
- **Monochrome glass redesign + Coverflow detail panel.** BeatOS moved off the Spotify-green/violet palette to a monochrome obsidian-void direction (Raycast / unveil.fr influence): a 3-tier token system (primitives → semantic) with a near-white accent, frosted `.glass` chrome (top bar / sidebar / player), and hover-float track rows. The right "Now Focused" panel's vinyl record was replaced by a 3D **Coverflow** — the focused cover sits front-and-centre with neighbours rotated back; click a side cover or ←/→ to change focus (two-way synced with the list), width-responsive across the 280–600px resize range, `prefers-reduced-motion` cross-fade. BPM/Key are now frameless white-phosphor mono numerals (no LCD box) whose glow tints to the focused cover's dominant colour. Solid `bg-accent text-white` buttons softened to a readable `.btn-primary` glass style; the list's Add-Track and filter rows merged into one toolbar. (Supersedes the never-released vinyl-panel redesign.) `CoverImage` keeps its opt-out `rounded` prop, now used by the square coverflow covers.
- **Spotify-style three-block layout + collapsible sidebar.** The sidebar / library / detail panels now float as rounded cards on a black canvas, separated by gutters whose full-height resize handles appear on hover. The sidebar collapses to an icon-only rail (toggle in its header), playlists render a 2×2 cover-collage thumbnail with a track-count subtitle, and opening a playlist shows a large hero (collage + name + count over a cover-tinted gradient); an empty list still shows its hero with the empty state below. The search box is always-expanded and centred in the top bar; the route title and the top-bar preview toggle were removed (a row click reopens the detail panel). Micro-labels unified into one `.beatos-eyebrow` (12px); track and playlist cover thumbnails standardised at 52px; left/right panel headers made symmetric (`⇤ LIBRARY` / `NOW FOCUSED ⇥`).

## [extension 0.2.7] — 2026-05-31 — NetEase album auto-create

- feat: the extension now auto-fills NetEase's **创建新专辑** form. It opens 选择专辑 (via a focus+mousedown+mouseup+click sequence — the custom selector ignores a bare click), clicks 创建新专辑, and fills **专辑名称** + **专辑描述** from the BeatOS export (专辑类型/版本 already default to 专辑/Beat). It always creates a NEW album, skips a description shorter than 10 字 (NetEase's minimum), and **never clicks 提交** — the album is created by your own submit. Drag the 专辑封面 yourself; the overlay confirms the album was filled and reminds you. App/sidecar unchanged (the export already carried `album_name`/`album_description`). Verified live on the logged-in upload page.

## [0.0.44] — 2026-05-31 — Free-track concept (FREE prefix + NetEase 免费使用)

### Added

- **Per-track 免费 (FREE) flag.** Toggle it in the track editor's License Tiers section header, and preset a default for new tracks in Settings → default license tiers ("新建 track 默认免费"). A free beat offers a free non-commercial lease **while its paid license tiers still apply** (it does not zero out pricing).
- **`{free}` template token.** A free track's beat name gets a configurable prefix (default `[FREE] `, editable in Settings → 上传模板 → 免费前缀); non-free tracks render no prefix. The old hardcoded `[FREE]` literal in the beat-name template is gone — it's now conditional on the flag.
- **NetEase 免费使用 auto-select.** On export, a free track has the **免费使用** option checked in the 授权设置 drawer, in addition to the paid 租赁授权 tiers (the drawer is multi-select; the two coexist). Verified live on the logged-in upload page — the option is labeled 免费使用 (不可商用), alongside 租赁授权 and 永久独家. The extension never submits. (extension 0.2.6)

### Notes

- New track column `is_free` (migration 018) + app-setting `default_is_free`; accepted across the HTTP, bulk, and MCP track-write paths.

## [0.0.43] — 2026-05-31 — Dogfood batch 1: reliable default tiers, primary producer, no-op album fill removed

### Added

- **Primary producer (★)** — mark which producer is "you" in Settings → Producers (click the star on a chip). The exported `{prod}` credit now lists that name **first**, and falls back to it when a track has no producer. This replaces the old standalone 制作人署名 fallback field (`upload_templates.prod`), which is removed; the primary name lives in `app_setting["primary_producer"]`. Removing the starred producer also clears the setting so `{prod}` never points at a deleted name.

### Fixed

- **New tracks now reliably copy the default license tiers (price + share).** The copy is awaited at create/import time instead of fire-and-forget, so the create-vs-copy race is gone; a tier whose deliverables already exist is skipped silently (idempotent), and a genuine failure surfaces a toast instead of a buried console warning. On an import where the audio attach fails, the just-created track is now hard-purged so its copied tiers cascade away (no orphaned trash ghost).
- **Stopped auto-filling NetEase's disabled 专辑名/专辑描述 inputs** — those inputs are bound through NetEase's separate album create/select flow, so filling them was a guaranteed no-op that falsely reported "filled". The two fields are removed from the extension recipe; the overlay now reminds you to create/select the album and fill its name+description manually (copy from the BeatOS export dialog, which still lists them). (extension 0.2.5)

## [0.0.42.1] — 2026-05-31 — Dogfood fix: 分成 input on unpriced tier rows

### Fixed

- **The 分成 (revenue-share %) input now shows on every license-tier row**, not just already-priced ones. Previously an unpriced preset row (MP3/WAV/STEMS) and a new custom tier (Add tier) had no share field, so you couldn't set a share until the tier had a price. Typing a share into an empty preset row now auto-creates the tier carrying that share (mirroring the price behavior). Also hardened: out-of-range share (e.g. 150) is dropped client-side instead of failing the create, a failed auto-create no longer leaves a stuck value that retry-loops, and the preset auto-create reads the latest input via a ref (fixing a one-keystroke-stale debounce). (Price auto-fill on the NetEase page was never broken — it needs the track to have CNY-priced tiers, which this UX fix makes easy to set.)

## [0.0.42] — 2026-05-30 — License-tier revenue share + multi-row NetEase price fill

### Added

- **Revenue-share (编曲分润比例) per license tier** — each tier now carries an optional `share` percentage (0–100) alongside its prices. Edit it in the track editor's license tiers (and preset a default in Settings → default license tiers); it persists on the tier (migration 017, append-only) and flows through the HTTP + MCP write paths.

### Changed

- **NetEase price auto-fill now fills every mapped tier row, with its share** — instead of just the first 售价. Export emits a structured `price_tiers` mapping (by deliverables: only-mp3 → MP3 row, +wav → MP3+WAV, +stem → MP3+WAV+分轨), and the extension checks each rental row and fills its 售价 + 编曲分润比例. CNY-priced tiers only; null share leaves 分润 blank; 永久独家 and the unlimited rental row stay manual (no BeatOS concept maps to them). Never auto-submits. Verified live on the real NetEase rental matrix.

## [0.0.41] — 2026-05-30 — Template refinements: producer from track, album description, publish date

### Changed

- **`{prod}` now comes from the track's producer**, not just a Settings string. Multiple producers join with a configurable separator (default ` x ` → `Averatec x Redketch`); the Settings field becomes a fallback used only when a track has no producer. Configure the separator in Settings → 上传模板 → 制作人连接符.

### Added

- **Album-description template** (`{publish date} Prod.{prod}` by default) — rendered into the NetEase 专辑描述 field and filled by the extension.
- **`{publish date}` placeholder** (`YYYY-MM-DD`, the export-day date; NetEase defaults 发布时间 to 立即发布). Usable in any template. The token regex now allows spaces inside `{...}`, so `{ title }` also resolves.

## [0.0.40] — 2026-05-30 — Upload templates (album name / Beat 名称 / Beat 说明)

### Added

- **Configurable upload templates** — Settings → 上传模板 lets you define three `{}` templates (专辑名 / Beat 名称 / Beat 说明) plus a producer credit, rendered at export time so the NetEase upload auto-fill submits formatted text instead of raw title/description. Placeholders: `{title} {genre} {year} {prod} {bpm} {key}` (unknown tokens kept verbatim, missing values blank). Defaults match the producer's existing format (`[FREE] "{title}" - {genre} TYPE BEAT`, `{year} {title}` for the album, and the non-commercial license boilerplate). Every beat maps to a single-track album; the extension now also fills 专辑名 and shows a cover-image reminder in the overlay (you still drag the cover + audio and submit — no auto-submit). Stored in `app_setting["upload_templates"]` (per-field merge over defaults; corrupt/partial settings fall back safely). The renderer (`beatos-core/export/templates.py`) is a pure function — the year is injected by `export_service`, keeping it deterministic and unit-tested. Verified end-to-end on the live NetEase page (专辑名 = `2026 仙泉`, Beat 名称 = `[FREE] "仙泉" - 国风 TYPE BEAT`, Beat 说明 = the boilerplate).

## [0.0.39] — 2026-05-30 — Platform auto-fill: KEY/标签/价格 fixed against the live page

### Fixed

- **调式 (KEY mode) now actually commits** — it was frequently left blank. Root cause (found by driving the real NetEase page with Playwright, not a static snapshot): Ant v3 closes a dropdown only on a *trusted* outside click, which a content script can't emit, so the genre/音名/调号 dropdowns stayed open and **accumulated**. A stale open dropdown then satisfied the "wait for a dropdown" check instantly, so the option scan raced ahead of 调式's own dropdown render and found nothing. `pickAntOption` now scopes strictly to each trigger's **own** dropdown via its `aria-controls` id and polls until the target option is present — no more race, no dependence on closing popups (which never worked). The 调式 dropdown still visibly lingers (unavoidable, cosmetic); the value is committed.
- **说明标签 (scene/mood tags) now fills moods** — the 添加标签 modal is a vertical-tab widget (适用场景 / 情绪表达 / 自定义) and moods live under 情绪表达, but the driver only ever looked at the default 适用场景 tab. It now switches tabs and matches buttons in each active panel.
- **价格 (授权设置) now fills a price** — it's a right-side **drawer**, not a modal (the old `.ant-modal` selectors never matched anything), and it's multi-step: checking 租赁授权 reveals the 售价 inputs. The driver opens the drawer, checks the configured license type, and fills the first tier's 售价 — best-effort, and it **never clicks 保存** (you review NetEase's sub-tier matrix and submit). All three verified end-to-end on the live logged-in page; the recipe's selectors were re-calibrated from the real DOM.

## [0.0.38] — 2026-05-29 — Platform upload auto-fill: custom widgets (Phase 2-B)

### Added

- **The uploader extension now fills NetEase's click-to-open widgets too** — not just the plain text fields. 曲风 (genre, single-select), KEY (音名/调号/调式, decomposed from a key like "F# minor" via `♯/♭/无` + English `Major/Minor`), 说明标签 (matches the track's mood/tags against NetEase's fixed scene-tag buttons), and 价格 (授权方式 modal). Implemented as typed async "widget drivers" in the extension (`interaction-fill.ts`) that resolve triggers by **stable `data-ne2e-name` anchors**, wait for the Ant portal/modal, scan every open dropdown for the matching option, click it, and verify — never submitting the form. Live-verified: 曲风 + KEY (音名/调号/调式) fill reliably; 说明标签/价格 are best-effort (NetEase's tag set rarely matches a track's moods, and the 授权方式 flow is multi-step — unmatched fields are listed in the overlay for manual entry). Widget selectors live as data in `beatos-platforms/.../netease/upload-form.json` (fixable without reloading the extension). Zero sidecar changes — the existing `/api/inject/form-map` endpoint just serves a richer recipe. Extension bumped to 0.2.0. **Known limitation:** NetEase's 调式 multi-select dropdown lingers open after selection (its value is still committed correctly) — it ignores Esc, outside-clicks, and trigger re-clicks (a quirk of that specific widget).

## [0.0.37] — 2026-05-29 — Platform upload auto-fill (browser extension, Phase 1)

### Added

- **Auto-fill a platform upload form from BeatOS** — a new companion browser extension (`apps/extension/`, MV3, load-unpacked) fills the NetEase 音乐人 beat-upload form with a track's metadata. Trigger it from the 导出 dialog → pick 网易云 → **发送到上传页**; switch to the logged-in upload tab and the extension fills the native text fields (Beat名称 / BPM / Beat说明) and shows an overlay listing what it filled and what's left. You drag the audio file and click submit yourself — the extension **never** submits. Click-to-open Ant widgets (曲风 / KEY / 标签 / 价格) are left for manual selection in this phase.
- **Sidecar inject staging** — `POST /api/inject/stage` resolves a track+platform into the existing `ExportResult` and holds it in a single overwrite slot; the extension polls a fixed port **48923** (`GET /api/inject/pending` consume-on-read, `GET /api/inject/form-map/{platform}`, `GET /api/inject/ping`). The main API keeps its ephemeral port; the fixed inject port is read-only and degrades gracefully if already in use. Field→selector maps live as data in `beatos-platforms/.../netease/upload-form.json` (fixable without reloading the extension). Uses the user's own logged-in browser session — no separate profile, no programmatic submit. (Phase 2 will add the AI/MCP `inject_to_platform` trigger via two-phase commit and multi-platform support.)

## [0.0.36] — 2026-05-29 — Genre/Mood display language toggle

### Added

- **Genre/Mood display language setting** — a global three-way toggle in Settings → "Genre / Mood Language" (`中文 (English)` / `中文` / `English`, default bilingual) controls how genre and mood values are displayed everywhere they appear: the track editor, bulk-edit dialog, filter popover, filter chips, the track list, and the track detail panel. Genres without a Chinese translation (e.g. `Boom Bap`) fall back to English. Stored values remain English-canonical (zero data migration) and NetEase export is unaffected. Backed by the `vocab_locale` app-setting; a single `formatVocabLabel` helper is the source of truth for every display site.

## [0.0.35.1] — 2026-05-29 — Dogfood fixes: deselect on empty click + IME duplicate-input

### Fixed

- **Clicking the empty area of the track list now deselects the focused track.** Previously a selected row stayed highlighted (and the preview panel kept showing it) no matter where else you clicked. Clicking the empty list background below the rows now clears both the selection and the focused track. The auto-select-first-row behavior was made one-shot (initial load only) so the deselect sticks instead of immediately bouncing back to the first row.
- **Search box no longer duplicates text typed via an IME.** Typing English (e.g. `regalia`) through a Chinese IME and pressing Enter produced `regalia regalia`: the Enter that *confirms* the IME candidate fired the keydown handler while composition was still active, mutating the controlled input mid-commit. The handler now ignores keys while `isComposing` is true — the first Enter confirms the IME candidate, a second Enter submits the search (the standard IME-aware behavior).

## [0.0.35] — 2026-05-29 — Bulk metadata edit + batch analyze

In-app bulk metadata editing and background batch BPM/Key analysis for any selection or the entire unanalyzed catalog.

### Added

- **Bulk metadata edit** — `BulkEditDialog` lets the user edit Genre, Mood, and Producer across any selection of tracks with three merge modes (追加 / 覆盖 / 移除: add-to-existing / replace / remove). A separate "Apply default license template" action bulk-stamps the default license tiers onto every selected track.
- **Batch BPM/Key analysis** — two entry points: "分析选中" in `BulkActionBar` (analyze selection) and a library-top "分析全部未分析 (N)" button (analyze every unanalyzed track). Analysis runs as a background job in the sidecar; the renderer polls for progress and shows a docked `AnalysisProgressBar` until completion. Only high-confidence results (BPM ≥ 0.7, Key ≥ 0.6) autofill empty fields.
- HTTP routes: `POST /api/tracks/bulk-update`, `POST /api/tracks/bulk-apply-license-template`, `POST /api/analysis/batch`, `GET /api/analysis/batch/{job_id}`, `GET /api/tracks/unanalyzed/count`.
- Renderer API clients: `api/bulk.ts` + additions to `api/analysis.ts`; `stores/analysis-job.ts` (1 s polling job store); `AnalysisProgressBar` component (docked, dismissible on completion).

### Changed (internal — no behavior change)

- Extracted `beatos_core.tracks.patch` (`apply_array_patch`, `FIELD_TO_COL`, `SCALAR_FIELDS`) as a shared multi-value delta helper — consumed by both the new `bulk_update_tracks` core function and the existing MCP approve handler (`update_tracks`/`merge_metadata`), eliminating duplicated array-merge logic.

## [0.0.34] — 2026-05-29 — Export / metadata packs

Per-track platform-shaped metadata export (NetEase first), reachable from the right-click context menu and the TrackEditor toolbar. Each exported field is individually copyable via a one-click copy button.

### Added

- `beatos_core/export/` — `ExportField` / `ExportResult` models, NetEase metadata renderer (en→zh field mapping, single-genre downgrade, price lines from license-tier prices), export service with platform registry, and a fetch/dispatch layer.
- HTTP routes: `GET /api/tracks/{id}/export?platform=<key>` returns a structured `ExportResult`; `GET /api/export/platforms` returns the registry of supported platforms.
- MCP read tools: `export_metadata(track_id, platform)` and `list_export_platforms()` — backed by the same service as the HTTP routes so agent output and in-app output are identical. Tool count 22 → 24.
- `beatos-platforms` is now an importable Python package (`beatos_platforms`) with a vocab loader and generated NetEase en→zh genre/mood maps (consumed by `beatos_core.export`). `beatos-core` declares it as a dependency.
- Renderer `ExportDialog` with platform selector and per-field copy buttons. Reachable via right-click on any track row and via the TrackEditor toolbar.

## [0.0.33.1] — 2026-05-29 — Player: Prev/Next buttons wrap around the queue

### Fixed

- The bottom-bar **Prev/Next buttons now cycle the queue**: Prev on the first track jumps to the last, Next on the last track jumps to the first — regardless of repeat mode. Previously wrap-around only happened with `repeat="all"`, so at a queue boundary the buttons did nothing useful (Next paused, Prev just restarted the current track). Auto-advance at track-end is unchanged: `repeat="off"` still stops at the end of the queue rather than looping forever (the manual buttons now pass an explicit `wrap` flag that the track-end path does not).

## [0.0.33] — 2026-05-29 — Audit batch 3: boot race fix + dedup refactors

Closes the remaining audit code items: one real fix plus two behavior-preserving refactors that kill duplicated logic. (The fourth item — Python ruff/mypy + Electron smoke in CI — is parked in ROADMAP as TBD.)

### Fixed

- Sidecar boot race (audit B2): `__main__.py` wrote the handshake file (advertising the port) before uvicorn had put the socket into listen mode, so a client reading the port too early could get Connection refused — observed as a CI flake. The handshake is now written from the server's `startup` hook, which completes only once the port is actually accepting requests.

### Changed (internal — no behavior change)

- Unified the HTTP and MCP track-search SQL builders behind a single `build_filter_clauses` in `beatos_core.tracks.sql_filter` (was hand-copied in `tracks/service.py` and `beatos_mcp/tools/tracks.py` — the drift class the v0.0.28/30 search work kept hitting). `MULTI_VALUE_FIELDS` / text-search columns now have one definition.
- Extracted the byte-identical license-tier price helpers (`inputsToPrices`, `pickFxSource`, `fxPlaceholderFor`, preset/currency constants, `LABEL_WIDTH`) shared by `LicenseTiersSection` and `DefaultLicenseTiersSection` into `lib/license-price.ts`. ~120 lines of duplication removed.

### Tests

- Unit tests for the extracted license-price helpers; the shared search builder is covered by the existing core + MCP search suites (all still green).

## [0.0.32] — 2026-05-29 — Audit batch 2: playback race + search escaping

Second batch from the code audit. Two verified-real fixes; the license preset double-create (H5) was investigated and dropped — the existing `creating` flag + per-preset debounce + post-create slot replacement already guard it, and the residual window isn't deterministically reproducible.

### Fixed

- Rapid track-switching could crash playback. `loadAndPlay` fired overlapping async calls with no ordering guard, so a slow earlier asset-fetch could clobber a newer track, and `AudioEngine.play()` dereferenced `this.player` after `await Tone.start()` without re-checking — a concurrent `load()`/`dispose()` during that await threw `TypeError: …reading 'start'`. Now: a latest-wins token in `loadAndPlay` bails superseded calls after each await, and `play()` re-checks the player after the await.
- Free-text search treated `%` and `_` as SQL LIKE wildcards: a query of `%` returned the whole catalog and `a_c` matched `abc`. User terms are now escaped (`escape_like` in `beatos_core.tracks.query_parser`, shared by the HTTP and MCP SQL builders) and the clauses declare `ESCAPE '\'`. Fixes both builders from one helper.

### Tests

- Engine race: `play()` survives a player disposed mid-`await Tone.start()`. Store race: a slow earlier `loadAndPlay` no longer clobbers a newer track. Search: `_`/`%` match literally (core + MCP).

## [0.0.31] — 2026-05-28 — Audit batch 1: security, data integrity, doc/test sync

First batch of fixes from a full read-only code audit (reports under `reports/audits/`). High-value, low-risk items only: a CORS hole, an orphaned-rows bug on purge, a 500-on-missing-list, a dead-ternary, plus doc/test drift. The deeper concurrency findings (player load race, license preset double-create) and the LIKE-escaping / shared-search-builder work are deferred to a later batch.

### Security

- Sidecar CORS was `allow_origin_regex=".*"` — any web page the user visited could reach the no-auth localhost API cross-origin and approve pending write tokens, defeating the human-in-the-loop gate. Now restricted to the renderer's own origins via the (previously dead) `_ALLOWED_ORIGINS` allowlist.

### Fixed

- `purge_track` / `purge_all_trash` opened SQLite connections without `PRAGMA foreign_keys = ON`, so the `ON DELETE CASCADE` on `asset` / `track_list` / `license_tier` / `analysis_cache` was a silent no-op and child rows were orphaned on every hard-delete. Both now enable FK enforcement. (The MCP approve path already did; only the direct HTTP routes were affected.)
- `update_list` on a non-existent id returned `None`, which serialized to an HTTP 500. Now raises `ValueError` → 400 (consistent with `update_track` and the other list routes).
- `ImportAudioDialog`: removed a dead `canAttach ? "new" : "new"` ternary. Default stays "new" by design — "attach" replaces an existing asset, so it must be an explicit choice, never the one-click default.

### Docs / tests

- `conventions/architecture.md`: rewrote the "MCP surface" section — it listed ~7 tools / "21" but `server.py` registers **22** (7 read + 15 write, all two-phase). The canonical trust-boundary spec was understating the write surface by ~15 tools.
- `scripts/smoke/sidebar.mjs`: the sidebar-order assertion was red (the documented baseline). The expected order was stale (`…Lists → Approvals`, actual is `…Approvals → Lists`) and it measured a shared wrapper `<div>` instead of the leaf buttons, collapsing several labels to the same `top`. Now anchors on the most-specific (shortest-text) element per label and asserts the actual order.
- Added core tests: purge cascade (both purge paths) and `update_list` raising on a missing id.

## [0.0.30] — 2026-05-27 — Pluggable analysis engine + cache fix

Makes the analysis engine a build-time switch instead of a hard dependency, so the AGPL exposure from v0.0.29 is opt-in rather than baked in. Also fixes a cache bug where a failed analysis stuck permanently.

### Added

- Pluggable analysis backends under `audio_analysis/backends/`: `essentia_backend` (AGPL, best accuracy + speed) and `librosa_backend` (ISC, permissive fallback). `bpm.py`/`key.py` are thin dispatchers; `get_backend()` auto-selects Essentia when its package is importable, else librosa. `BEATOS_ANALYSIS_ENGINE=librosa|essentia` forces a choice.
- Essentia is now an OPTIONAL extra: `uv sync --extra essentia` (personal/dev). A plain `uv sync` installs only the permissive librosa engine — what distributed builds ship, so AGPL copyleft does not attach by default. See `NOTICE`.

### Fixed

- `analyze_asset` no longer caches a total-failure result (no bpm AND no key), and treats an existing total-failure cache row (incl. legacy `0.0`/`''`) as a miss. Previously a transient/old-engine failure was cached and short-circuited all future re-analysis, leaving a track stuck showing BPM 0 even after the engine was fixed.

## [0.0.29] — 2026-05-26 — Audio analysis engine: librosa → Essentia

BPM/key analysis was the weak spot: librosa's confidence metric scored beat-grid *regularity*, not correctness, so a halftime/triplet octave error (a perfectly regular wrong grid) could be auto-filled with high confidence — wrong BPM, confidently. It was also slow (~10–14 s/track). A benchmark over a real catalog picked Essentia: BPM 8/8 vs librosa 7/8 (fixes the octave errors), key tied, and ~6× faster (~2 s/track).

### Changed

- BPM detection now uses Essentia `RhythmExtractor2013` (multifeature), which resists the half/double/triplet-time octave errors librosa's `beat_track` made on halftime-feel beats. Confidence is normalised against Essentia's documented "good" band so reliable detections clear the autofill bar and shaky ones route to manual review.
- Key detection now uses Essentia `KeyExtractor` with the `bgate` profile, which won the catalog benchmark over the previous Krumhansl-Schmuckler template (notably avoiding relative-major confusion). Track duration now read via `mutagen` instead of librosa.
- Dependency: `librosa` (ISC) replaced by `essentia` (**AGPL-3.0**). No obligations for personal/dev use; see `NOTICE` for the distribution caveat (Essentia must become an optional dependency with a permissive fallback before any binary distribution — the bpm/key functions are a clean swap seam).

### Fixed

- `analyze_bpm` now returns `(None, 0.0)` instead of `(0.0, 0.0)` on a decode/analysis failure, so a corrupt file is never cached as a valid 0 BPM (mirrors `analyze_key`).

### Migrations

- `016_reset_analysis_cache.sql` — clears `analysis_cache` so every asset re-analyzes under the new engine on next request (lazy, re-cached).

## [0.0.28] — 2026-05-25 — Search overhaul

Search was weak: a client-side substring filter over only the loaded rows (title/genre/tags), so producer/key/description queries returned nothing. v0.0.28 moves search server-side across the whole catalog, adds a shared query-syntax parser (used by both the HTTP route and a new MCP `search_tracks` tool, so agent search == in-app search), and gives the box an empty-state recommendation dropdown.

### Fixed

- `SearchInput`: a pending debounce timer could clobber an explicit dropdown pick (recent search or facet chip) if the user typed then quickly picked within the 250 ms window. Pending timer is now cancelled at the top of `onPickQuery` and `onPickChip`.
- `GET /api/tracks?query=`: quoted phrases (e.g. `"young chop"`) were being re-split on whitespace before reaching SQLite LIKE, so `"young chop"` matched tracks with `young` OR `chop` anywhere instead of the contiguous phrase. The HTTP route now passes the pre-parsed term list directly to `list_tracks`/`tracks_in_list`, matching exactly what the MCP `search_tracks` tool does (human == agent guarantee).
- `GET /api/tracks?query=&genres=`: discrete query params and parsed structured tokens were merged with `or` (discrete silently dropped parsed values when non-empty). Now unioned with order-preserving dedup, so `?genres=trap&query=genre:drill` returns both tracks.

### Added

- `GET /api/tracks?query=` accepts a free-text query string parsed by `beatos_core.tracks.query_parser.parse_query`; structured tokens (`genre:trap`, `bpm:>=140`, `producer:X`) are merged with discrete params (discrete wins), and remaining free text + `tag:` tokens are forwarded as a LIKE search. Works for both the library view and `?list_id=` (list) view.
- MCP read tool `search_tracks(query, limit)` — parses the query with the same `parse_query` used by the HTTP route so agent search and in-app search return identical results. Field tokens, BPM operators, `has:audio`, quoted phrases, and bare-word LIKE search are all supported.
- `GET /api/tracks/facets?field=<producer|genre|mood|key>&limit=N` — returns top values with counts for search dropdown chips.
- `GET /api/tracks/recent-searches` and `POST /api/tracks/recent-searches` — capped (8), deduped, most-recent-first list of recent search strings, persisted via `app_setting`.
- Renderer `facetsApi` (`api/facets.ts`) — typed client for `/api/tracks/facets`, `/api/tracks/recent-searches` (GET + POST). `ListParams.q` serialized as `?query=` in `tracks.list`.
- Search box (`SearchInput`) full rewrite + new `SearchDropdown`: typing a completed `genre:`/`mood:`/`producer:`/`key:` token (on trailing space or Enter) absorbs it into the corresponding chip filter; remaining free text drives a debounced live filter of the main list (`bpm:`/`has:` tokens stay in the box and reach the backend parser). When the box is open, focused, and empty, a dropdown surfaces recent searches, top producer/genre/key quick-picks, and the 5 most recently added tracks. Enter pushes the query to recent searches.

## [0.0.27.1] — 2026-05-24 — Producers section: chip cluster + add-from-Settings

Settings → Producers was a row-per-name list with no add affordance — long
and low-density, and the only way to introduce a producer name to the
catalog was to attach it to a track first.

### Added

- **`known_producers` app_setting** — Settings can now pre-register
  producer names without a track. The TrackEditor Producer dropdown
  union-merges this list with the existing distinct-from-tracks values,
  so a name added in Settings appears in the picker immediately.
- **Inline "+ Add producer" affordance** in the chip cluster — Enter to
  commit, Esc / blur-with-empty-name to cancel. Duplicate names raise a
  warning toast and re-focus the input.

### Changed

- **Producers section rebuilt as a chip cluster.** Each name is a chip
  with an X button; ~8–10 chips fit per row vs 1 per row previously.
  Solid `bg-accent/20` chips = in use on at least one track; dashed
  outline = registered in Settings only (no tracks reference it yet).
  Removing a used chip clears the name from every track (existing
  `producers.rewrite([name], null)` path); removing a dashed chip just
  unlinks from `known_producers`. Both flows confirm via `confirm()`.
- `use-track-editor-state.ts` `refreshProducerOptions` switched to the
  union helper `loadAllProducerNames()`.

### Tests

`SettingsPanel.test.tsx` updated for the chip layout (assertions on
`producer-chip` testid count + per-chip remove aria-labels) and a default
mock for `appSettings.get` so the new known-producer load path resolves
cleanly under the test fetch shim.

## [0.0.27.0] — 2026-05-24 — Multi-currency license tiers + default-tier presets

A producer's pricing strategy travels with the catalog: every tier can now
hold prices in multiple currencies at once, and new tracks pick up
user-configured default tiers automatically.

### Added

- **`license_tier.prices` is now a currency-keyed map**
  (`{"CNY": 300, "USD": 50}`) replacing the old `price + currency` pair.
  Renderer shows three input slots per tier: CNY and USD are always
  visible; the third slot is a currency picker (EUR / JPY / GBP / none).
  Schema lift in migration `015_license_tier_multi_currency.sql`:
  `prices_json TEXT NOT NULL DEFAULT '{}'` with a `json_object(currency,
  price)` backfill, followed by drop of the old columns. The migration
  also clears in-flight `set_license_tiers` tokens because their payload
  shape changed.
- **FX-converted placeholder hints** in every empty price slot. When one
  slot has a value, the empty slots show the bare converted number in
  gray placeholder text (e.g. `17.79`) computed from the hardcoded FX
  snapshot — the producer sees both currencies at a glance without
  committing to a number. No "≈" prefix because the grayed placeholder
  color already signals "this is a hint, not committed" and the extra
  glyph would clip 4-digit conversions in the 80 px input. Works in
  both the per-track editor and the Settings default-tier templates.
- **Default license tier templates in Settings.** Producers configure
  CNY / USD / third-currency prices for MP3, WAV, STEMS, and any custom
  tier; the template is auto-applied to every newly-created track. Empty
  rows are skipped (no tier is auto-added for that deliverable). Existing
  tracks are not touched when defaults change. Templates persist in the
  new `app_setting` key/value table (migration
  `014_app_setting.sql`) so the configuration travels with the catalog,
  not the machine.
- **`/api/app_settings/{key}` endpoints** — GET / PUT / DELETE for the
  new key/value JSON store. First consumer: `default_license_tiers`.

### Changed

- **MCP `set_license_tiers` tool now takes `prices: dict` per tier.** Old
  shape (`{price: 50, currency: "CNY"}`) is rejected — agents should send
  `{prices: {"CNY": 50}}`. Tool description rewritten to reflect the new
  shape and recommend one deliverable per tier. The 2PC payload schema
  changed in lockstep; migration 015 clears any pending tokens so the
  approve handler never receives a payload it can't interpret.
- Renderer `LicenseTier` API type drops `price`/`currency`; gains
  `prices: Record<string, number>`. The DeliverablesPicker was already
  removed in 0.0.26.3 — preset slots and custom rows are the only paths
  in the v0.0.27 layout.

### Migration notes

- Existing single-currency tiers backfill cleanly: `price + currency` →
  `{currency: price}`.
- Any external 2PC consumer that approved a `set_license_tiers` token
  issued before upgrading should re-issue the call; the approve handler
  expects the new payload shape.

## [0.0.26.3] — 2026-05-24 — FILES-style license tiers + small UX patches

Bundle of four dogfood findings.

### Changed

- **License tier editor redesigned to mirror the FILES section.** MP3,
  WAV, and STEMS are now three fixed preset slots — empty rows render
  with a dashed border (matching the empty asset rows above); typing a
  price into a dashed slot creates the tier after a 600 ms debounce.
  Custom tiers (e.g. MIDI) are added via the unchanged top-right
  "+ Add tier" button, which now opens an inline name+price+currency
  draft instead of immediately creating an empty row. Multi-deliverable
  legacy bundles (`["wav","stem"]`) still load but render in a separate
  area below the customs — they were never produceable by the new
  picker but stored data is preserved. The standalone `DeliverablesPicker`
  popover was removed. MCP `set_license_tiers` docstring updated to
  prefer one-deliverable-per-tier so agent output lands cleanly in the
  preset slots; multi-deliverable tiers are still accepted.
- **Back-arrow style in the top bar** — was `text-text-tertiary` 16 px
  next to two `font-medium` neighbors, reading as a half-rendered glyph.
  Now `text-text-secondary` 18 px with a `hover:bg-bg-row-hover` chip,
  matching the toggle-preview button on the right.

### Fixed

- **Clicking the Title column resizer collapsed the column.** The
  `1fr`-default Title track flipped to a fixed pixel width on every
  click (any synthetic micro-move past 0 px wrote `setWidth`). Added a
  3 px movement threshold in `ColumnResizer` — pure clicks no longer
  commit a width.
- **Mood and Producer chip rows drifted out of alignment.** Latin chips
  ("AVERATEC") and CJK chips ("可爱 (Cute)") had subtly different
  line-heights, and the "+ Add" button's 1 px border put it on a
  different baseline than the borderless chips. Pinned both to `h-7
  leading-none` so the chip height is decoupled from glyph script and
  border presence — Mood and Producer columns now wrap at identical
  vertical positions.

## [0.0.26.2] — 2026-05-24 — License editor dogfood fixes

Three bugs found while exercising the new tier editor — all in one
patch.

### Fixed

- **"Add tier" failed with 400 "name must be non-empty"** — the renderer
  intentionally sends `name: ""` for non-first tiers so the row label
  can auto-derive from `deliverables`, but the backend rejected blank
  names. Relaxed `create_tier` / `update_tier` / `replace_tiers_for_track`
  + the MCP `_validate_tier`: empty name is now accepted everywhere,
  with the renderer's auto-derived display label (`MP3 + WAV`) as the
  user-visible label and `"Untitled tier"` as the persisted fallback.
  The two tests that previously asserted "non-empty rejected" are
  inverted to "empty accepted."
- **Switching currency away then back lost the original price** — the
  v0.0.26.1 design fired a debounced PUT on every currency change,
  silently overwriting `{price: 700, currency: CNY}` with
  `{price: null, currency: USD}` the moment the user clicked USD to
  peek at the conversion. Now each tier carries a per-currency
  `priceMemory` (renderer-only): switching back to a currency where a
  value was previously typed restores that value; switching to a
  currency with no memory clears the field for the placeholder hint
  AND skips the autosave so the server's state stays put until the
  user actively commits.
- **Two tiers with the same deliverables coexisting** — a track could
  carry duplicate `["mp3"]` tiers, which is confusing for publish
  adapters and produces identical row labels (auto-derived from
  deliverables). Now blocked end-to-end: comparison is order- and
  case-insensitive (`["mp3","wav"]` and `["WAV","MP3"]` collide);
  empty `deliverables` are exempt (multiple mid-edit rows are fine);
  `update_tier` excludes self (a tier never dupes against itself);
  add-tier's MP3 seed falls back to empty when `["mp3"]` already
  exists. Renderer pre-flights the check in `updateLocal` so a
  conflicting toggle reverts immediately with a warning toast instead
  of round-tripping a 400.

### Tests

6 new core tests (dedup with order/case insensitivity,
multiple-empty allowed, update-self allowed, batch internal-dedup).
Two existing tests inverted (empty name now accepted in core +
MCP validator).

## [0.0.26.1] — 2026-05-24 — Compact tier rows + FX hints

Dogfood follow-up on `0.0.26`. The original layout used a 4-row card per
tier (name + deliverables + price/currency + notes); for a producer who
typically lists 2-4 tiers per beat the vertical space cost was high.

### Changed

- **Each tier is now one row**: `[Deliverables ▾]  [Price]  [Currency]
  ≈ $14 · €13  [⋮ expand]  [🗑]`. The deliverables trigger is a compact
  popover with the `mp3 / wav / stem` presets plus a custom-add input.
- **Name + notes moved behind a `⋮` expand** — tier display label is
  auto-derived from deliverables (`MP3 + WAV`). When the user customizes
  the name, it sticks; the auto-sync only fires while the name still
  matches the deliverables join, so power-users keep their wording.

### Added

- **FX reference inside the price input** (`lib/fx-rates.ts`) — when the
  user switches currency (e.g. ¥700 → USD), the price input clears and
  the converted amount (`≈ 97`) shows as the `<input placeholder>`.
  Disappears the moment the user types — so it never competes with a
  real value and never lingers as ambient gray noise. Computed from a
  hardcoded mid-market snapshot (CNY / USD / EUR / JPY / GBP, dated
  `FX_SNAPSHOT_DATE`). No network call, no auto-refresh; "spot the
  typo" reference only. Bump the table when ranges drift >10%.

### Internal

- New `TrackEditor/DeliverablesPicker.tsx` — purpose-built compact
  multi-select; `ChipMultiSelect` was kept for the existing chip-cluster
  surfaces (Producer / Genre / Mood) where the inline chip look is the
  right pattern.

## [0.0.26] — 2026-05-23 — License tiers

Replaces the long-placeholder `track.license_type` + `track.price` fields
(both removed from the UI in v0.0.25 already) with a proper one-to-many
`license_tier` table. Each track now carries 0..N tiers, each with a freeform
name, a list of deliverable tokens, a price, a currency, and notes. Generic
enough to map to NetEase / BeatStars / Airbit / etc. when those adapters
land; producers can also use it as an in-app price sheet.

### Added

- **`license_tier` table** (migration `013_license_tiers.sql`) — track-scoped,
  positioned. `deliverables` stored as a JSON array of free string tokens
  (recommended values: `mp3` / `wav` / `stem`, but custom values are
  accepted so platform adapters can map their own vocab). Backfills a
  default tier on any pre-existing track that carried a non-default
  `license_type` or a `price`; everything else gets no tiers. The old
  `track.license_type` and `track.price` columns are then dropped.
- **HTTP**: `GET/POST /api/tracks/{id}/license_tiers`,
  `POST /api/tracks/{id}/license_tiers/reorder`,
  `PUT/DELETE /api/license_tiers/{tier_id}`.
- **MCP**: `set_license_tiers(track_id, tiers[])` — whole-list replace via
  the same 2PC token flow as `update_tracks`. Tool count: 20 → 21.
- **TrackEditor**: new "License Tiers" section between Files and the bottom
  action row. Per-tier card lets the user edit name, deliverables (chip
  multi-select with `mp3` / `wav` / `stem` as defaults + custom add),
  price + currency, and notes. Local edits autosave at 600ms; tier add /
  delete are immediate.

### Removed

- `track.license_type` (TEXT) and `track.price` (REAL) columns — replaced
  by the per-tier model. Renderer `Track` interface, all editor helpers,
  and test fixtures updated accordingly. The retired `LICENSE_TYPES`
  constant (`lease_basic` / `lease_premium` / `exclusive`) is gone.

## [0.0.25.1] — 2026-05-23 — Bulk actions + UX patches

First batch of dogfood patches on top of the `0.0.25` baseline.

### Added

- **`BulkActionBar`** — floating bar that surfaces when ≥2 rows are selected.
  Mounted in the library view (Add to list / Move to trash) and Trash view
  (Restore / Delete forever). Previously multi-select existed but had no
  visible affordance — most users never discovered it.
- **`AddToListPopover`** — list picker for the bulk "Add to list" action,
  filters out the currently-open list to avoid the obvious no-op.
- **Cmd/Ctrl+A** — select all visible rows in the library and Trash. Esc
  clears selection. Skipped when focus is in a text field.
- **Back arrow in TopBar** — visible on non-root routes (Editor / Settings /
  Approvals / Trash). Uses `history.state.idx` with a NaN guard for the
  known HashRouter quirk (remix-run/react-router#10964); falls back to `/`
  when there is no prior entry (deep-link reload).
- **Trash — Empty trash button** — header-level red action that hard-deletes
  every trashed row in one round-trip via the new
  `POST /api/tracks/trash/purge_all` endpoint (`{purged: N}` response).
- **Trash multi-select** — shift / cmd click, range select, plus the same
  Cmd+A / Esc bindings as the library view.

### Fixed

- **Drag-track-to-list "Added 1" was misleading for duplicates** —
  `add_track_to_list` was idempotent at the SQL level (`INSERT OR IGNORE`)
  but the caller could not tell insert from no-op. Backend now returns
  `{added: bool}` per call; renderer toast distinguishes
  *added* / *already in list* / *failed*. Logic centralized in
  `lib/add-tracks-to-list.ts` so the dnd path and the new BulkActionBar
  share one source of truth.
- **Text-selection bleed in the table** — Cmd+A and click-drag selected the
  text in `TrackRow` / `TableHeader` cells instead of rows. Both surfaces
  now carry `select-none`; Cmd+A is captured at panel level and routed to
  the row-selection action.

### Internal

- Defensive selection cleanup — when the underlying track list goes empty
  (MCP-driven deletion, etc.), `selectedIds` is dropped so the BulkActionBar
  cannot reappear with stale IDs once content returns.

## [0.0.25] — 2026-05-19 — UI/UX dogfood baseline

The first dogfood-driven polish cycle. This line will absorb continuous UX fixes
as `0.0.25.1`, `0.0.25.2`, ... while the underlying feature set stays stable.
Use this version as the floor for daily-use feedback against the new sidebar
layout, drop-import flow, and AI agent surface.

### UI/UX

- **Drop-import dialog** — dragging audio onto the library now prompts for
  destination (new track / attach to selected) + role (tagged / untagged),
  rather than silently creating tracks. Single-file drops onto a focused
  track can replace its audio asset in one flow.
- **Sidebar layout reworked** — All Beats / Trash / Approvals on top, Lists
  in the middle, `@averatec0773` + Settings pinned at the bottom. Settings
  moved off the TopBar (Claude-style pinning).
- **Approvals badge** — yellow circular pill (replaces the previously broken
  `text-warning` no-op class).
- **Track row selection** — `bg-accent-soft` background + full-height accent
  bar; right-click context-menu adds a `ring-accent` outline so it's obvious
  which row the menu is acting on.
- **Now Focused panel** — License/Price replaced with Genre; Credits block
  added (Producer, Tags, Added, Updated) plus a conditional Description.
- **Chip multi-select global delete** — popover closes immediately + toast
  confirms; the previous "popover stays open after delete" UX was unclear.
- **Drag-track-to-list** — emits success / partial / error toast.
- **macOS traffic-light vertical alignment** — `trafficLightPosition` set so
  the dots line up with the topbar title (requires Electron restart to apply).

### Fixes

- Add long-missing `--bg-row-active` and `--warning` CSS tokens — three
  classes (`bg-bg-row-active` on sidebar active route, `text-warning` on
  Approvals badge + AnalyzeResultDialog warnings) had been silently no-op
  for multiple versions.
- `audio_analysis/service.py` — wrap synchronous `analyze()` in
  `asyncio.to_thread`. The librosa pipeline no longer blocks the sidecar
  event loop, so concurrent track-list / asset fetches no longer stall
  during analysis (root cause of "info disappears during analyze").
- Auto-analyze on drop is now **disabled by default**. The librosa pipeline
  is slow and accuracy is mediocre; running it implicitly on every imported
  file produced more confusion than value. The manual *Analyze audio* button
  in TrackEditor still works. A library swap (essentia is the candidate)
  is queued for the next major version.

### README

- Reframed around the producer workflow (multi-platform re-publishing as the
  driver) and the AI-agent surface as a first-class feature, not a footnote.
- First real screenshot in place of the placeholder.

## Earlier versions

Versions **0.0.24.2 and older** (2026-05-14 → 2026-05-19) are preserved verbatim in
[CHANGELOG-archive.md](CHANGELOG-archive.md) — the foundation work, MCP write surface,
and pre-0.0.25 history, moved out to keep this file focused on the current feature set.
