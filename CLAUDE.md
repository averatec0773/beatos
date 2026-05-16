# Project Harness

## Project


**Name:** BeatOS
**Description:** Local-first desktop application for beat producers — catalog beats and their assets, publish to multiple platforms via browser automation, expose the library to AI agents via MCP.
**Stack:** Electron 39 + React 19 + Vite + Tailwind + Radix UI primitives (renderer); Python 3.11 + FastAPI + aiosqlite + structlog + mcp (sidecar); SQLite (storage); Playwright `_electron` (smoke harness, v0.0.5+).
**Owner:** averatec (single-user, AI-assisted development).

> All files except `README.md` are agent instructions. Treat them as authoritative.

## Session Start Protocol

At the start of every session:

1. Run `git fetch && git status` — confirm the local repo is up to date with remote. If behind, pull before proceeding.
2. Run `git log --oneline -10` — orient to recent history.
3. Confirm working directory before any write or destructive operation.

## Core Rules

1. Read the skill file before any dangerous or irreversible operation.
2. Follow conventions. Do not invent new patterns unless explicitly asked.
3. Read `memory/rules.md` and apply all rules for the duration of this session.

## Settings

- Shared permissions → [.claude/settings.json](.claude/settings.json)
- Personal overrides → `.claude/settings.local.json` (gitignored, auto-created on first session from `.claude/settings.local.json.example`)

## Index

### Skills
<!-- Auto-loaded by Claude Code based on each skill's description field. -->
- [setup](.claude/skills/setup/SKILL.md)
- [memory](.claude/skills/memory/SKILL.md)
- [changelog](.claude/skills/changelog/SKILL.md)
- [skill-creator](.claude/skills/skill-creator/SKILL.md)

### Conventions
- [architecture](conventions/architecture.md)
- [design-direction](conventions/design-direction.md)
- [testing](conventions/testing.md)

### Memory
- [rules](memory/rules.md)
- [notes](memory/notes.md)

## v0.0.5+ — AI Dev Loop

Prefer running the smoke harness over asking the user to click + screenshot:

- `cd apps/desktop && npm run dev:fresh` — kill orphans, start fresh; logs to `apps/desktop/logs/`
- `npm run smoke` — built-app smoke (run `npm run build` first)
- `npm run logs:tail` — tail Electron + sidecar JSONL

Log files (dev):
- `apps/desktop/logs/main.log` — Electron main + `[sidecar]`-tagged stderr lines
- `apps/desktop/logs/sidecar.jsonl` — structured Python sidecar (one JSON per line, includes `request_id`)

MCP servers (template in `.claude/settings.local.json.example`):
- **playwright-electron** — drive the running app, screenshot, evaluate
- **local-logs** — tail JSONL, filter by level

If these tools are available, don't ask the user to click+screenshot — verify directly.
