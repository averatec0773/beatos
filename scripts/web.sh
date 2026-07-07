#!/usr/bin/env bash
# scripts/web.sh — build + serve the BeatOS web frontend (browser SPA), FREE build.
#
# The browser counterpart of `make dev`: serves the built SPA AND the API from a
# single sidecar on a fixed port, then opens the browser. `uv sync` prunes the
# private Pro engine (not a uv workspace member), so this is a clean non-Pro build
# — the Publish Center stays a locked upsell. For the Pro variant use `make web-pro`.
# Override the port with BEATOS_HTTP_PORT (default 8765) and the library with
# BEATOS_DB_PATH (default: the per-OS app-data dir, e.g. ~/Library/Application
# Support/beatos-desktop/global.db — the same library as the desktop app; a
# pre-v0.0.50 ~/Music/BeatOS library is copied over once on first run).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${BEATOS_HTTP_PORT:-8765}"
WEB_DIR="$ROOT/apps/desktop/out/web"
URL="http://127.0.0.1:${PORT}/"

echo "[web] uv sync (free build — prunes the Pro engine if it was installed)"
uv sync

echo "[web] building SPA…"
( cd "$ROOT/apps/desktop" && npm run build:web )

echo "[web] serving at ${URL}  (Ctrl-C to stop)"
# Open the browser once the server is up (best-effort; macOS open / Linux xdg-open).
(
  sleep 1.5
  if command -v open >/dev/null 2>&1; then open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
  fi
) &

exec env BEATOS_HTTP_PORT="$PORT" BEATOS_WEB_DIR="$WEB_DIR" uv run python -m beatos_http
