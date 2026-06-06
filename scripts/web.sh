#!/usr/bin/env bash
# scripts/web.sh — build + serve the BeatOS web frontend (browser SPA).
#
# Unlike `make dev` (where Electron owns the sidecar), web mode serves the built
# SPA AND the API from a single sidecar on a fixed port, then opens the browser.
# Override the port with BEATOS_HTTP_PORT (default 8765) and the library with
# BEATOS_DB_PATH (default ~/Music/BeatOS/global.db).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${BEATOS_HTTP_PORT:-8765}"
WEB_DIR="$ROOT/apps/desktop/out/web"
URL="http://127.0.0.1:${PORT}/"

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
