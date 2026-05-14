# BeatOS Makefile — top-level command runner.

.PHONY: help dev sync build launch-chrome test test-py clean

help:
	@echo "BeatOS targets:"
	@echo "  make dev            — run uv sync, then electron-vite dev"
	@echo "  make sync           — uv sync (resolve Python workspace)"
	@echo "  make test           — run all tests (Python now; Vitest in v0.0.2+)"
	@echo "  make test-py        — uv run pytest packages/"
	@echo "  make launch-chrome  — start Chrome on the BeatOS profile (CDP @ 9222) — v0.0.4+"
	@echo "  make build          — placeholder; electron-builder wired in v0.0.6"
	@echo "  make clean          — remove build artifacts"

dev:
	bash scripts/dev.sh

sync:
	uv sync

test: test-py

test-py:
	uv run pytest packages/ -v

launch-chrome:
	bash scripts/launch_chrome.sh

build:
	@echo "build: not implemented in v0.0.1 (electron-builder lands in v0.0.6)"
	@exit 1

clean:
	rm -rf apps/desktop/out apps/desktop/dist apps/desktop/release
	find . -type d -name __pycache__ -exec rm -rf {} +
