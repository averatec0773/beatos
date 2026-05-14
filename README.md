# BeatOS

> *The operating system for beat producers.*

BeatOS is a local-first desktop application for music producers — primarily beat-makers selling on marketplaces like BeatStars and Airbit. It catalogs a producer's beats and their assets, publishes them to multiple platforms by driving each platform's upload form in the user's own browser, and exposes the same library to AI agents via the [Model Context Protocol](https://modelcontextprotocol.io/) (MCP).

**Status:** `v0.0.1` — walking skeleton. Not yet useful end-to-end.

## Architecture (one paragraph)

Electron 33 hosts a React 19 + Vite + Tailwind + shadcn renderer. The Electron main process spawns a Python 3.11 sidecar (FastAPI + aiosqlite + mutagen + playwright) and the renderer talks to it over `http://127.0.0.1:<ephemeral port>`. A separate stdio MCP server exposes the same library to AI agents. All data stays on the user's machine — no server, no account, no telemetry by default.

## Develop

Prerequisites:

- macOS or Windows (Linux works for dev; not a supported install target)
- Node ≥22 LTS (`apps/desktop/.nvmrc` documents the preferred version)
- Python 3.11.x
- [`uv`](https://github.com/astral-sh/uv) — `brew install uv`
- Google Chrome (used by the browser-automation feature, v0.0.4+)

One-time:

```bash
make sync                                    # uv sync — resolve the Python workspace
cd apps/desktop && npm install && cd -
```

Run:

```bash
make dev           # uv sync + electron-vite dev (window opens)
make test          # uv run pytest packages/
```

## Repository layout

```
apps/desktop/         ← Electron + React renderer
packages/
  beatos-core/        ← pure Python business logic
  beatos-http/        ← FastAPI facade
  beatos-mcp/         ← stdio MCP server
conventions/          ← architecture, design direction, testing
.claude/, memory/, docs/  ← local-only (gitignored by repo policy)
```

## License

MIT — see `LICENSE`.
