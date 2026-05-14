# Changelog

All notable changes to BeatOS will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); BeatOS uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html) starting at `0.0.1`.

## [0.0.1] - 2026-05-14

### Added

- Initial walking skeleton: Electron + React + Vite + Tailwind + shadcn renderer; Python 3.11 sidecar with FastAPI `/api/health` route; MCP server with `ping` tool.
- Three-package Python workspace (`beatos-core`, `beatos-http`, `beatos-mcp`) under `uv`.
- SQLite schema migration `001_init.sql` (library / track / asset / watch_folder / settings / schema_version).
- Design tokens (Spotify-dark palette) seeded into the renderer; Inter + JetBrains Mono fonts.
- Repository harness (CLAUDE.md, AGENTS.md, conventions) customized from `averatec/averatec-harness-template`.

### Notes

This release is structural only — no end-user features yet.
