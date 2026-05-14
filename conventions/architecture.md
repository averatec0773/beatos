# Architecture

This is the *code-level* architecture for AI agents touching files in this repo. Product architecture, mental models, and rationale live in the BeatOS charter (local-only).

## Layering rules

1. `packages/beatos-core/` is pure Python business logic. No imports from `fastapi`, `mcp`, or Electron-side files. Allowed deps: stdlib, `aiosqlite`, `pydantic`, `playwright`, `mutagen`, `watchdog`.
2. `packages/beatos-http/` and `packages/beatos-mcp/` are thin facades. Each route / tool is a few lines that calls into `beatos-core` and shapes the response.
3. `apps/desktop/electron/` (main + preload) is also thin. It spawns the Python sidecar, creates `BrowserWindow`, exposes native dialogs / tray / shortcuts via IPC. Business logic lives in `beatos-core`.
4. The renderer (`apps/desktop/src/`) talks to `beatos-http` over `http://127.0.0.1:<port>`. Port is ephemeral, written by the sidecar to a JSON handshake file, exposed to the renderer via `contextBridge` in `preload.ts`.

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
  resources/sidecar/         ← PyInstaller artifacts (populated in v0.0.6)
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
    automation/              ← Playwright CDP engine (v0.0.4+)
    adapters/                ← per-platform upload form drivers

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
```

## Key components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Migration runner | `packages/beatos-core/beatos_core/db.py` | Reads `migrations/*.sql` and applies any not in `schema_version`. Append-only — never edit an applied migration. |
| Handshake writer | `packages/beatos-http/beatos_http/handshake.py` | Writes `{"port": <int>, "started_at": <iso>}` to a known path on startup, before uvicorn accepts connections. |
| Handshake reader | `apps/desktop/electron/main.ts` | Polls the handshake file with a 5s timeout, then creates the `BrowserWindow`. |
| Adapter registry | `packages/beatos-core/beatos_core/adapters/registry.py` | Maps platform name → adapter class. New platforms slot in here. |

## Handshake file location

```
$XDG_RUNTIME_DIR/beatos/handshake.json                       (Linux, if XDG_RUNTIME_DIR set)
~/Library/Application Support/BeatOS/runtime/handshake.json   (macOS)
%APPDATA%\BeatOS\runtime\handshake.json                       (Windows)
```

In Electron main, derive from `app.getPath('userData') + '/runtime/handshake.json'`. The Python side reads `BEATOS_HANDSHAKE_PATH` env var (set by Electron main) and falls back to a platform-default if unset (useful when running the sidecar standalone for tests).

## What NOT to change without reading context first

- `migrations/001_init.sql` — never modify after applied; add `002_*.sql` and forward.
- `track.description` column — sacred (user-authored); AI output goes to `description_draft` only.
- The two-phase commit pattern on MCP write tools — non-negotiable.
- The Electron main / renderer separation — never `nodeIntegration: true` in `BrowserWindow`; always go through `preload.ts` contextBridge.
