# Changelog

All notable changes to BeatOS will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); BeatOS uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html) starting at `0.0.1`.

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
