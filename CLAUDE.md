# BeatOS — Agent Harness

**BeatOS** is a local-first desktop app for beat producers: catalog beats + assets, publish to platforms via browser automation, expose the library to AI agents over MCP. Single-user, no server, no telemetry.

**Stack:** Electron 39 + React 19 + Vite + Tailwind + Radix (renderer) · Python 3.11 + FastAPI + aiosqlite + structlog + mcp (sidecar) · SQLite · Playwright `_electron` (smoke harness).

**Monorepo:** `apps/desktop/` (Electron shell + React) · `packages/beatos-core/` (pure Python logic) · `packages/beatos-http/` (FastAPI facade) · `packages/beatos-mcp/` (MCP facade) · `packages/beatos-platforms/` (per-platform vocab maps).

> All files except `README.md` are agent instructions. Treat them as authoritative.

## Session start

1. `git fetch && git status` — confirm up to date with remote; pull if behind.
2. `git log --oneline -10` — orient to recent history.
3. Confirm working directory before any write or destructive operation.

## Critical agent rules

1. **`track.description` is sacred** — user-authored only. AI output goes to `track.description_draft`. Promoting a draft is an explicit user action.
2. **Migrations are append-only.** Never edit an applied `migrations/*.sql`; add `00N+1_*.sql`. (Single exception in v0.0.4 — never repeat.)
3. **`beatos-core` has no web / RPC / Electron deps.** If you reach for `fastapi` / `mcp` / Electron-side imports in core, you are in the wrong layer.
4. **MCP / inject is human-in-the-loop.** Two-phase commit (`token` → `confirm_*`) on any write tool. Never programmatically submit a platform upload form.
5. **Zustand v5 stable selectors** — never `.filter` / `.map` / `.find` inside a selector (infinite re-render → black screen). Select the list, derive in `useMemo`.
6. **Always `preventDefault` in `dragover`** — including when `dataTransfer.types.includes("Files")` is false. Otherwise `drop` never fires (lesson re-applied across v0.0.13.2 / v0.0.14).

For per-file context (which columns, which patterns) read [conventions/architecture.md](conventions/architecture.md) §"What NOT to change without reading context first".

## Commands

```bash
# from apps/desktop/
npm run dev:fresh              # kill orphan uvicorn + start dev (Vite + sidecar)
npm run build                  # typecheck + electron-vite build
npm run smoke                  # built-app smoke harness (run build first)
npm run logs:tail              # tail Electron main.log + sidecar.jsonl
npx vitest run                 # renderer + main tests (212 as of v0.0.14.1)
npx vitest run path/to/x.test.ts   # single file
node scripts/diagnose-playback.mjs --tiny  # audio playback diagnostic

# from repo root
uv run pytest                  # sidecar tests (213 as of v0.0.14)
uv run pytest packages/beatos-http/tests/test_x.py::test_y   # single test
```

Logs (dev): `apps/desktop/logs/main.log` (Electron + `[sidecar]`-tagged stderr) · `apps/desktop/logs/sidecar.jsonl` (structured, one JSON per line, includes `request_id`).

## Ship gate

Before `git tag -a vX.Y.Z … && git push origin vX.Y.Z`, confirm `CHANGELOG.md` has an entry for that exact version. If missing → invoke the [changelog](.claude/skills/changelog/SKILL.md) skill first. **No silent ships.**

## AI dev loop (v0.0.5+)

If the smoke harness or MCP tools below are available, **drive the app directly** — don't ask the user to click + screenshot.

MCP servers (template in `.claude/settings.local.json.example`):
- **playwright-electron** — drive the running app, screenshot, evaluate against the renderer

## Index

### Conventions
- [architecture](conventions/architecture.md) — vision, glossary, layering rules, directory map, per-version capability tables, MCP surface, "what NOT to change"
- [design-direction](conventions/design-direction.md) — visual direction
- [vocab-genre-mood-scene](conventions/vocab-genre-mood-scene.md) — genre/mood vocab (NetEase-aligned)

### Roadmap
- [ROADMAP](ROADMAP.md) — pending v0.0.X + v0.1.0 + future v0.2+

### Skills (`.claude/skills/`)
- [setup](.claude/skills/setup/SKILL.md) · [memory](.claude/skills/memory/SKILL.md) · [changelog](.claude/skills/changelog/SKILL.md) · [skill-creator](.claude/skills/skill-creator/SKILL.md)

### Memory
- [rules](memory/rules.md) · [notes](memory/notes.md)

### Settings
- Shared → [.claude/settings.json](.claude/settings.json)
- Personal overrides → `.claude/settings.local.json` (gitignored, auto-created from `.example`)
