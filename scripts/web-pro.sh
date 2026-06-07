#!/usr/bin/env bash
# scripts/web-pro.sh — web frontend (browser SPA) WITH the private Pro publish engine.
#
# The browser counterpart of `make dev-pro`. Same as scripts/web.sh, but after
# `uv sync` it (re)installs the beatos-publish engine into the venv so the browser
# build's Publish Center is enabled. The engine is intentionally NOT a uv workspace
# member (see packages/pro-mount-notes.md), so `uv sync` PRUNES it on every run —
# this reinstalls it after the sync, before the sidecar (spawned via `uv run`, which
# preserves it) starts. On a public checkout without the submodule it warns and
# falls back to the free build.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENGINE="packages/pro/beatos-publish"
PORT="${BEATOS_HTTP_PORT:-8765}"
WEB_DIR="$ROOT/apps/desktop/out/web"
URL="http://127.0.0.1:${PORT}/"

echo "[web-pro] uv sync"
uv sync

if [ -f "$ENGINE/pyproject.toml" ]; then
  echo "[web-pro] installing Pro engine into the venv (uv sync prunes it each run)"
  # --no-deps: beatos-core + pydantic are already in the venv; the engine's own
  # pyproject carries a standalone beatos-core path source that resolves wrong here.
  uv pip install -e "$ENGINE" --no-deps
  uv pip install "patchright>=1.40"
  echo "[web-pro] Pro engine ready. For live login/publish run once: patchright install chromium"
else
  echo "[web-pro] WARNING: $ENGINE not found — the Pro submodule isn't checked out."
  echo "[web-pro]   git submodule update --init packages/pro"
  echo "[web-pro] Falling back to the FREE build (Publish Center disabled)."
fi

echo "[web-pro] building SPA…"
( cd "$ROOT/apps/desktop" && npm run build:web )

echo "[web-pro] serving at ${URL}  (Ctrl-C to stop)"
# Open the browser once the server is up (best-effort; macOS open / Linux xdg-open).
(
  sleep 1.5
  if command -v open >/dev/null 2>&1; then open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
  fi
) &

exec env BEATOS_HTTP_PORT="$PORT" BEATOS_WEB_DIR="$WEB_DIR" uv run python -m beatos_http
