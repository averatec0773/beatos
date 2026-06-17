#!/usr/bin/env bash
# scripts/launcher/start-beatos.sh — BeatOS one-click launcher (macOS / Linux).
# For non-technical users: checks/installs dependencies, then starts BeatOS
# in the browser (default) or as the desktop app. Double-click
# start-beatos.command at the repo root to run this. Idempotent.
#
# Mirrors scripts/web.sh / web-pro.sh / dev.sh:
#   uv sync -> (Pro engine reinstall if submodule present) -> build SPA -> sidecar
# Browser rebuilds are skipped when the build matches the current git HEAD
# (marker file in out/web); menu option 3 forces a rebuild.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# uv hardlinks packages from its cache by default; when the cache and the venv
# sit on different filesystems the link fails and uv falls back to a partial
# copy that can leave half-written package metadata (a gutted *.dist-info makes
# every later `uv pip install` abort). Force copy mode so installs are complete.
export UV_LINK_MODE=copy

PORT="${BEATOS_HTTP_PORT:-8765}"
URL="http://127.0.0.1:${PORT}/"
WEB_DIR="$ROOT/apps/desktop/out/web"
MARKER="$WEB_DIR/.beatos-build-head"

step() { printf '\n\033[36m==> %s\033[0m\n' "$1"; }
ok()   { printf '\033[32m    %s\033[0m\n' "$1"; }
warn() { printf '\033[33m    %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31m[ERROR] %s\033[0m\n' "$1"; read -r -p "Press Enter to exit " _; exit 1; }

port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && { exec 3>&-; return 0; } || return 1; }

open_url() {
  if command -v open >/dev/null 2>&1; then open "$1"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1"
  fi
}

# Open the SPA as a chromeless app window (Chrome/Edge --app=) so it looks like
# a desktop app; fall back to a normal browser tab when neither is installed.
open_app_window() {
  if command -v open >/dev/null 2>&1; then
    open -na "Google Chrome" --args --app="$1" 2>/dev/null && return
    open -na "Microsoft Edge" --args --app="$1" 2>/dev/null && return
  fi
  open_url "$1"
}

echo ""
printf '\033[35m  BeatOS Launcher\033[0m\n'
echo "  ------------------------------------"

# ---------------------------------------------------------------- 1/5 uv
step "[1/5] Checking Python environment manager (uv)"
export PATH="$HOME/.local/bin:$PATH"
if ! command -v uv >/dev/null 2>&1; then
  warn "uv not found — installing automatically... (first run only, ~1 min)"
  curl -LsSf https://astral.sh/uv/install.sh | sh \
    || fail "uv auto-install failed. Check your network and retry, or install manually: https://docs.astral.sh/uv/"
  command -v uv >/dev/null 2>&1 || fail "uv still unavailable after install. Close this window and double-click to start again."
fi
ok "uv ready: $(uv --version)"

# ---------------------------------------------------------------- 2/5 Node
step "[2/5] Checking Node.js (requires v22 or newer)"
node_ok=false
if command -v node >/dev/null 2>&1; then
  major="$(node --version | sed 's/^v//' | cut -d. -f1)"
  if [ "$major" -ge 22 ]; then node_ok=true; else warn "Current Node.js v$major is too old"; fi
fi
if [ "$node_ok" != true ]; then
  if command -v brew >/dev/null 2>&1; then
    warn "Installing Node.js via Homebrew... (first run only, ~2 min)"
    brew install node || fail "Node.js install failed."
  else
    fail "Node.js not found. Download and install the LTS version from https://nodejs.org/ then restart."
  fi
fi
ok "Node.js ready: $(node --version)"

# ---------------------------------------------------------------- 3/5 npm install
step "[3/5] Checking frontend dependencies"
if [ ! -d "$ROOT/apps/desktop/node_modules" ]; then
  warn "First launch: downloading frontend dependencies... (~3-5 min, please wait)"
  ( cd "$ROOT/apps/desktop" && npm install ) || fail "Frontend dependency install failed (npm install). Check your network and retry."
fi
ok "Frontend dependencies ready"

# ---------------------------------------------------------------- 4/5 uv sync + Pro
step "[4/5] Syncing Python dependencies"
# A running instance holds the venv (Pro engine imports) and can break uv
# sync's prune — if BeatOS is already up, just open the window.
if port_busy "$PORT"; then
  warn "BeatOS is already running — opening the window for you."
  open_app_window "$URL"
  sleep 2
  exit 0
fi
if ! uv sync; then
  # Most common cause: an orphan sidecar (python -m beatos_http, parent gone)
  # still holds the venv — close it and retry once (same idea as dev:fresh).
  warn "Sync failed — closing leftover BeatOS background processes and retrying..."
  pkill -f "python -m beatos_http" 2>/dev/null || true
  sleep 1
  uv sync || fail "Python dependency sync failed (uv sync). Close all BeatOS windows and retry; if it still fails, check your network."
fi
ok "Python dependencies ready"

# Pro engine: uv sync prunes it every run (not a workspace member) — reinstall
# after sync, exactly like scripts/web-pro.sh. Absent submodule = free build.
ENGINE="$ROOT/packages/pro/beatos-publish"
if [ -f "$ENGINE/pyproject.toml" ]; then
  warn "Pro module detected — loading the publish engine..."
  uv pip install -e "$ENGINE" --no-deps || fail "Pro engine install failed."
  uv pip install "patchright>=1.40" || fail "patchright install failed."
  uv run patchright install chromium
  ok "Pro publish engine ready"
else
  ok "Free edition (no Pro module mounted)"
fi

# ---------------------------------------------------------------- 5/5 launch
step "[5/5] Choose how to start"
echo ""
echo "    [1] Browser app (recommended, default on Enter)"
echo "    [2] Desktop app"
echo "    [3] Browser app — force rebuild (use this if the UI didn't update)"
echo ""
read -r -p "    Enter a number and press Enter " choice
choice="${choice:-1}"

if [ "$choice" = "2" ]; then
  # Desktop: electron-vite dev — Electron main owns the sidecar (scripts/dev.sh).
  step "Starting the desktop app... (window appears shortly; closing this window exits)"
  cd "$ROOT/apps/desktop"
  exec npm run dev
fi

need_build=true
head="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || true)"
if [ "$choice" != "3" ] && [ -f "$WEB_DIR/index.html" ] && [ -f "$MARKER" ] && [ -n "$head" ] \
   && [ "$(cat "$MARKER")" = "$head" ]; then
  need_build=false
fi
if [ "$need_build" = true ]; then
  step "Building the web UI... (~1 min)"
  ( cd "$ROOT/apps/desktop" && npm run build:web ) || fail "Web build failed (npm run build:web)."
  [ -n "$head" ] && printf '%s\n' "$head" > "$MARKER"
else
  ok "Web UI is up to date, skipping build"
fi

step "Starting BeatOS..."
(
  for _ in $(seq 1 60); do
    sleep 0.5
    if port_busy "$PORT"; then open_app_window "$URL"; exit 0; fi
  done
) &

echo ""
ok "BeatOS will be running at: $URL"
warn "Keep this window open; closing it (or pressing Ctrl-C) exits BeatOS."
exec env BEATOS_HTTP_PORT="$PORT" BEATOS_WEB_DIR="$WEB_DIR" uv run python -m beatos_http
