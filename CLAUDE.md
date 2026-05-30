# BeatOS — Agent Harness

**BeatOS** is a local-first desktop app for beat producers: catalog beats + assets, publish to platforms via browser automation, expose the library to AI agents over MCP. Single-user, no server, no telemetry.

**Stack:** Electron 39 + React 19 + Vite + Tailwind + Radix (renderer) · Python 3.11 + FastAPI + aiosqlite + structlog + `mcp` (FastMCP, mounted on FastAPI sidecar at /mcp) + `mcp-proxy` (stdio bridge) · SQLite · Playwright `_electron` (smoke harness).

**Monorepo:** `apps/desktop/` (Electron shell + React) · `packages/beatos-core/` (pure Python logic) · `packages/beatos-http/` (FastAPI facade) · `packages/beatos-mcp/` (FastMCP tools + stdio bridge launcher) · `packages/beatos-platforms/` (per-platform vocab maps).

> All files except `README.md` are agent instructions — starting context, not infallible. Verify against current code before acting on specifics; flag stale-looking content rather than following it blindly.

## Session start

1. `git fetch && git status` — confirm up to date with remote; pull if behind.
2. `git log --oneline -10` — orient to recent history.
3. Confirm working directory before any write or destructive operation.

## Critical agent rules

1. **Migrations are append-only.** Never edit an applied `migrations/*.sql`; add `00N+1_*.sql`. (Single exception in v0.0.4 — never repeat.)
2. **`beatos-core` has no web / RPC / Electron deps.** If you reach for `fastapi` / `mcp` / Electron-side imports in core, you are in the wrong layer.
3. **MCP / inject is human-in-the-loop.** Two-phase commit (`token` → `await_approval`) on any write tool. Never programmatically submit a platform upload form.
4. **Zustand v5 stable selectors** — never `.filter` / `.map` / `.find` inside a selector (infinite re-render → black screen). Select the list, derive in `useMemo`.
5. **Always `preventDefault` in `dragover`** — including when `dataTransfer.types.includes("Files")` is false. Otherwise `drop` never fires (lesson re-applied across v0.0.13.2 / v0.0.14).
6. **SPA route reuse** — when a route stays mounted across param changes (`/track/1` → `/track/2` keeps `<TrackEditor>` mounted with new `params`), `useEffect([])` does NOT re-run. Per-track effects must depend on `params.id` (caught at v0.0.14.1: producer distinct went stale across tracks).
7. **Upstream-store → local-form sync** must update both the form state AND the dirty baseline (e.g. `initialTrack`), otherwise the upstream patch (auto-analyze writing bpm/key) registers as a user edit and re-fires auto-save in a loop.
8. **MCP launcher stdout is JSON-RPC only.** The `beatos-mcp` launcher entrypoint (`__main__.py`, `launcher.py`) and the `mcp-proxy` subprocess space must NEVER `print()` or write to stdout — Claude Desktop reads stdout as protocol bytes and a stray newline will silently disconnect. Log via `beatos_mcp.log.configure()` (routes to file + stderr). Tool implementations are NOT subject to this constraint: they run inside the sidecar HTTP process and communicate over HTTP, not stdio.
9. **SQLite FK enforcement is per-connection and OFF by default.** Any `aiosqlite.connect()` that issues a `DELETE` on a parent row must `PRAGMA foreign_keys = ON` first, or the `ON DELETE CASCADE` is a silent no-op and child rows orphan (caught at v0.0.31: `purge_track`/`purge_all_trash` leaked asset/list/tier/cache rows). The MCP approve path enables it centrally; direct HTTP write paths must do it themselves.
10. **The browser-extension inject uses a FIXED port 48923, read-only (v0.0.37).** The main API is on an ephemeral port the extension can't discover, so the sidecar also serves the inject `read_router` (pending/form-map/ping) on fixed `BEATOS_INJECT_PORT` (default 48923) — never expose write endpoints there (the renderer stages via the ephemeral main port). It has no CORS by design (the extension's `host_permissions` bypass page CSP; the absence of CORS headers blocks random web pages). The extension fills metadata only and never submits the form (see rule 3). Selectors are data in `beatos-platforms/.../<platform>/upload-form.json` — fix the JSON on a platform redesign, no extension reload.

11. **Debug the upload-form widget drivers against the LIVE platform page, not a saved snapshot (v0.0.39).** The reference HTML snapshot and jsdom mocks lack the modals/drawer/lazy-rendered options that only exist at runtime, and a self-authored mock just encodes your assumptions — both go green while the real page fails. Drive the real logged-in page via the Playwright MCP: click → read the actual DOM mutation → fix the recipe/driver → re-verify live. Two live-confirmed Ant v3 facts: (a) a dropdown closes only on a **trusted** outside click, which a content script can't emit, so dropdowns accumulate — scope each pick to its trigger's own dropdown via `aria-controls` and poll for the option (don't rely on closing popups); (b) NetEase's 授权设置 is a right-side `ant-drawer`, not `.ant-modal`, and 说明标签 is a vertical-tab modal whose moods live under a non-default tab.

For per-file context (which columns, which patterns) read [conventions/architecture.md](conventions/architecture.md) §"What NOT to change without reading context first".

## Commands

> Run `npm` / `npx` commands from `apps/desktop/`. Sidecar Python tests run from repo root via `uv run`. IDE TypeScript diagnostics ("Cannot find module …") are frequently stale after file changes — trust `npm run build`, not the editor.

```bash
# from apps/desktop/
npm run dev:fresh              # kill orphan uvicorn + start dev (Vite + sidecar)
npm run build                  # typecheck + electron-vite build
npm run smoke                  # built-app smoke harness (run build first)
npm run logs:tail              # tail Electron main.log + sidecar.jsonl
npx vitest run                 # renderer + main tests
npx vitest run path/to/x.test.ts   # single file
node scripts/diagnose-playback.mjs --tiny  # audio playback diagnostic

# Debounced / async effects in vitest require:
#   vi.useFakeTimers({ shouldAdvanceTime: true })
#   userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
#   await vi.advanceTimersByTimeAsync(ms)
# Canonical example: src/renderer/src/__tests__/TrackEditor.test.tsx

# from repo root
uv run pytest                  # sidecar tests
uv run pytest packages/beatos-http/tests/test_x.py::test_y   # single test
```

Logs (dev): `apps/desktop/logs/main.log` (Electron + `[sidecar]`-tagged stderr) · `apps/desktop/logs/sidecar.jsonl` (structured, one JSON per line, includes `request_id`).

## Doc sync (pre-commit)

Before any non-trivial `git commit`, invoke the [harness](.claude/skills/harness/SKILL.md) skill proactively. It reads the working tree, then for each of `CHANGELOG.md`, `conventions/`, `CLAUDE.md`, `README.md` decides whether a small targeted edit is needed. The user may also invoke it explicitly ("harness", "doc check", "check before commit", or equivalent). Skip for typo / comment / formatting / test-only diffs and for diffs that only touch `.claude/` or `memory/`. No enforcement hook, no version bump, no tag pipeline. "All unchanged" is a valid outcome.

## Fix bundling

Bug fixes / small tweaks from the same dogfood round = **ask first, then one commit, one patch bump**. Don't auto-ship each fix as its own `0.0.X.Y → 0.0.X.Y+1` step — pause, confirm scope with the user, then bundle.

## Subagent model

When dispatching via the `Agent` tool, pick by task weight: current top-tier for judgment-heavy work (planning, deep review, hard debugging); next tier down for routine analysis. Cheap parallel lookups where stale conventions won't bite are fine on older tiers. Omitting `model` inherits the parent's.

For high-stakes review (architecture decisions, security, hard debugging), prefer a reviewer family different from the author — shared weights share blind spots. For routine checks, same family is fine.

## AI dev loop (v0.0.5+)

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
- [harness](.claude/skills/harness/SKILL.md) · [audit](.claude/skills/audit/SKILL.md) · [skill-creator](.claude/skills/skill-creator/SKILL.md)

### Memory
- [rules](memory/rules.md) · [notes](memory/notes.md)

### Settings
- Shared → [.claude/settings.json](.claude/settings.json)
- Personal overrides → `.claude/settings.local.json` (gitignored, auto-created from `.example`)
