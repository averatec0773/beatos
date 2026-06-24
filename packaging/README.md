# Packaging

Build tooling for shipping BeatOS as an installable app instead of a from-source
checkout.

## Sidecar binary

`beatos-sidecar.spec` bundles the Python sidecar (`beatos-http` with `beatos-mcp`
mounted at `/mcp`) into a self-contained folder so end users don't need Python,
`uv`, or a manual `uv sync`. It uses the permissive **librosa** analysis engine
only; the AGPL Essentia extra is never bundled.

Prerequisites (build-time only, in the uv venv):

```bash
uv pip install pyinstaller pyinstaller-hooks-contrib   # or: uv sync --group build
```

Build:

```bash
uv run pyinstaller packaging/beatos-sidecar.spec --noconfirm \
    --distpath dist --workpath build/.pyi-work
```

Output: `dist/beatos-sidecar/beatos-sidecar` (onedir). Both `dist/` and `build/`
are gitignored — only the spec is tracked.

Smoke-check the built binary boots like `python -m beatos_http`: run it with
`BEATOS_HTTP_PORT` and `BEATOS_DB_PATH` set, then confirm `/api/health` responds,
`/api/tracks` returns 200 (DB opened + migrations ran inside the bundle), and a
`POST /api/tracks/{id}/analyze` succeeds (librosa imported + ran in the bundle).

Next steps (tracked in the loop backlog): wire Electron's main process to spawn
this binary in production with a dev fallback to `uv run`, and package it into the
installer via electron-builder `extraResources`.
