#!/usr/bin/env bash
# BeatOS one-click launcher (macOS). Double-click me.
# All logic lives in scripts/launcher/start-beatos.sh.
exec bash "$(cd "$(dirname "$0")" && pwd)/scripts/launcher/start-beatos.sh" "$@"
