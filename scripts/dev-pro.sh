#!/usr/bin/env bash
# scripts/dev-pro.sh — dev loop WITH the private Pro publish engine.
#
# Same as scripts/dev.sh, but after `uv sync` it (re)installs the beatos-publish
# engine into the venv. The engine is intentionally NOT a uv workspace member
# (see packages/pro-mount-notes.md), so `uv sync` PRUNES it on every run — this
# script reinstalls it after the sync, before the sidecar (spawned via `uv run`,
# which preserves it) starts. On a public checkout without the submodule it warns
# and falls back to the free build.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENGINE="packages/pro/beatos-publish"

echo "[dev-pro] uv sync"
uv sync

if [ -f "$ENGINE/pyproject.toml" ]; then
  echo "[dev-pro] installing Pro engine into the venv (uv sync prunes it each run)"
  # --no-deps: beatos-core + pydantic are already in the venv; the engine's own
  # pyproject carries a standalone beatos-core path source that resolves wrong here.
  uv pip install -e "$ENGINE" --no-deps
  uv pip install "patchright>=1.40"
  echo "[dev-pro] Pro engine ready. For live login/publish run once: patchright install chromium"
else
  echo "[dev-pro] WARNING: $ENGINE not found — the Pro submodule isn't checked out."
  echo "[dev-pro]   git submodule update --init packages/pro"
  echo "[dev-pro] Falling back to the FREE build (Publish Center disabled)."
fi

echo "[dev-pro] starting electron-vite (window will open shortly)…"
cd "$ROOT/apps/desktop"
exec npm run dev
