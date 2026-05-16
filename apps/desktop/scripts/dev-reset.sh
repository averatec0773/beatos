#!/usr/bin/env bash
# Kill stray BeatOS processes, free common dev ports, clear log files.
# Idempotent — safe to run when nothing is running.
set -u

pkill -f 'uvicorn.*beatos' 2>/dev/null || true
pkill -f 'python.*beatos_http' 2>/dev/null || true

for port in $(seq 5000 5050); do
  pids=$(lsof -ti:${port} 2>/dev/null || true)
  if [ -n "${pids}" ]; then
    kill -9 ${pids} 2>/dev/null || true
  fi
done

LOG_DIR="$(dirname "$0")/../logs"
rm -f "${LOG_DIR}"/*.log "${LOG_DIR}"/*.jsonl 2>/dev/null || true

echo "[dev-reset] killed orphans, freed ports 5000-5050, cleared logs"
