#!/usr/bin/env bash
# scripts/dev.sh — single-command dev loop for BeatOS v0.0.1.
#
# The Electron main process is the sole owner of the Python sidecar.
# This script does NOT start uvicorn separately — main spawns it via
# `uv run python -m beatos_http` on app.whenReady().

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Ensure Python workspace is resolved so `uv run` is fast on spawn.
echo "[dev] uv sync"
uv sync

echo "[dev] starting electron-vite (window will open shortly)…"
cd "$ROOT/apps/desktop"
exec npm run dev
