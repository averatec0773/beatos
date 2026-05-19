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
7. **SPA route reuse** — when a route stays mounted across param changes (`/track/1` → `/track/2` keeps `<TrackEditor>` mounted with new `params`), `useEffect([])` does NOT re-run. Per-track effects must depend on `params.id` (caught at v0.0.14.1: producer distinct went stale across tracks).
8. **Upstream-store → local-form sync** must update both the form state AND the dirty baseline (e.g. `initialTrack`), otherwise the upstream patch (auto-analyze writing bpm/key) registers as a user edit and re-fires auto-save in a loop.
9. **Audio goes through `audio-engine.ts`, not `<audio>`.** v0.0.16 migrated to Tone.js / Web Audio. Don't reintroduce HTMLAudioElement. New CSP directives (`worker-src 'self' blob:`, `connect-src beatos-asset:`) and protocol privilege (`corsEnabled: true`) are load-bearing — if Tone fetch fails silently, check them first.
10. **MCP stdout is JSON-RPC only.** Any code reachable by `beatos-mcp` (tools, helpers, imports) must NEVER `print()` or write to stdout — Claude Desktop reads stdout as protocol bytes and a stray newline will silently disconnect. Log via `beatos_mcp.log.configure()` which routes to file + stderr.
11. **Concurrent SQLite writers need `BEGIN IMMEDIATE` + `busy_timeout`.** WAL allows multiple readers + 1 writer, but two concurrent `BEGIN` (deferred) + write produces `SQLITE_BUSY_SNAPSHOT` — a distinct error code that the default busy_handler does NOT retry. The approve dispatcher (`beatos_http/routes/tokens.py::approve_token`) uses `BEGIN IMMEDIATE` so a second writer queues and waits up to the `timeout=5` instead of failing immediately. Use `BEGIN IMMEDIATE` for any handler in `_APPROVE_HANDLERS`.

For per-file context (which columns, which patterns) read [conventions/architecture.md](conventions/architecture.md) §"What NOT to change without reading context first".

## Commands

> Run `npm` / `npx` commands from `apps/desktop/`. Sidecar Python tests run from repo root via `uv run`. IDE TypeScript diagnostics ("Cannot find module …") are frequently stale after file changes — trust `npm run build`, not the editor.

```bash
# from apps/desktop/
npm run dev:fresh              # kill orphan uvicorn + start dev (Vite + sidecar)
npm run build                  # typecheck + electron-vite build
npm run smoke                  # built-app smoke harness (run build first)
npm run logs:tail              # tail Electron main.log + sidecar.jsonl
npx vitest run                 # renderer + main tests (233 as of v0.0.16)
npx vitest run path/to/x.test.ts   # single file
node scripts/diagnose-playback.mjs --tiny  # audio playback diagnostic

# Debounced / async effects in vitest require:
#   vi.useFakeTimers({ shouldAdvanceTime: true })
#   userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
#   await vi.advanceTimersByTimeAsync(ms)
# Canonical example: src/renderer/src/__tests__/TrackEditor.test.tsx

# from repo root
uv run pytest                  # sidecar tests (213 as of v0.0.14)
uv run pytest packages/beatos-http/tests/test_x.py::test_y   # single test
```

Logs (dev): `apps/desktop/logs/main.log` (Electron + `[sidecar]`-tagged stderr) · `apps/desktop/logs/sidecar.jsonl` (structured, one JSON per line, includes `request_id`).

## Doc sync (pre-commit)

Before any non-trivial `git commit`, invoke the [harness](.claude/skills/harness/SKILL.md) skill proactively. It reads the working tree, then for each of `CHANGELOG.md`, `conventions/`, `CLAUDE.md`, `README.md` decides whether a small targeted edit is needed. The user may also invoke it explicitly ("harness", "doc check", "check before commit", or equivalent). Skip for typo / comment / formatting / test-only diffs and for diffs that only touch `.claude/` or `memory/`. No enforcement hook, no version bump, no tag pipeline. "All unchanged" is a valid outcome.

## AI dev loop (v0.0.5+)

If the smoke harness or MCP tools below are available, **drive the app directly** — don't ask the user to click + screenshot.

- **Audio playback issues** → `node scripts/diagnose-playback.mjs [--tiny|--large]` or `BEATOS_TEST_AUDIO=/path/to.wav node scripts/diagnose-playback.mjs`. Captures every HTMLMediaElement event with timestamps. Byte-level WAV repair lives in `src/main/asset-protocol.ts::repairWavIfNeeded`.

**Playwright `_electron` gotchas:**
- `app.evaluate` / `window.evaluate` only support top-level imports; `await import(...)` inside throws "dynamic import callback was not specified". Pull imports out and pass values in via the second arg.
- Renderer `fetch()` cannot reach `beatos-asset://` — CSP `connect-src` excludes custom schemes. Probe protocols via `app.evaluate` from the main process, or through the `<audio>` / `<img>` element (`media-src` / `img-src` allow it).
- Smoke assertion order is load-bearing — earlier checks assume specific tracks/sources/routes exist. State-mutating new tests should append AFTER the existing block (the DAW-WAV regression #30 sits at the end for this reason).

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
- [setup](.claude/skills/setup/SKILL.md) · [memory](.claude/skills/memory/SKILL.md) · [harness](.claude/skills/harness/SKILL.md) · [skill-creator](.claude/skills/skill-creator/SKILL.md)

### Memory
- [rules](memory/rules.md) · [notes](memory/notes.md)

### Settings
- Shared → [.claude/settings.json](.claude/settings.json)
- Personal overrides → `.claude/settings.local.json` (gitignored, auto-created from `.example`)
