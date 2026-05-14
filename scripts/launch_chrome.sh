#!/usr/bin/env bash
# scripts/launch_chrome.sh — launch Chrome on the dedicated BeatOS profile
# with CDP enabled. Used by v0.0.4+ for adapter injection.

set -euo pipefail

PROFILE_DIR="${HOME}/.chrome-beatos-profile"
CDP_PORT=9222

mkdir -p "$PROFILE_DIR"

if [[ "$OSTYPE" == "darwin"* ]]; then
  CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
  CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
else
  CHROME="$(command -v google-chrome || command -v chromium || true)"
fi

if [[ -z "$CHROME" ]] || [[ ! -x "$CHROME" ]]; then
  echo "Chrome not found. Install from https://www.google.com/chrome/"
  exit 1
fi

exec "$CHROME" --user-data-dir="$PROFILE_DIR" --remote-debugging-port=$CDP_PORT
