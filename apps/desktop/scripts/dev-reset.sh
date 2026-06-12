#!/usr/bin/env bash
# Kill stray BeatOS sidecar processes and clear log files.
# Idempotent — safe to run when nothing is running.
set -u

pkill -f 'uvicorn.*beatos' 2>/dev/null || true
pkill -f 'python.*beatos_http' 2>/dev/null || true

LOG_DIR="$(dirname "$0")/../logs"
rm -f "${LOG_DIR}"/*.log "${LOG_DIR}"/*.jsonl 2>/dev/null || true

echo "[dev-reset] killed orphan sidecars, cleared logs"
