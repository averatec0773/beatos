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

## Packaging the desktop app

`electron-builder.yml` copies `dist/beatos-sidecar/` into the app under
`<Resources>/beatos-sidecar/` via `extraResources`. In a packaged build the
Electron main process spawns that binary (`resolveSidecarSpawn` keys off
`is.dev`); dev and the unpacked smoke still run the sidecar from source via `uv`.

Build the sidecar binary FIRST (above), then package — electron-builder reads
`dist/beatos-sidecar/`, so packaging fails if it is missing:

```bash
cd apps/desktop
npm run build:unpack   # electron-builder --dir → release/<platform>/BeatOS.app
npm run build:mac      # → release/ dmg
```

macOS builds are currently **unsigned** (`mac.identity: null`), so first launch
needs right-click → Open to get past Gatekeeper. Signing + notarization (Apple
Developer account) and Windows code signing are deferred. PyInstaller can't
cross-compile, so the Windows binary must be built on Windows.
