# BeatOS Makefile — top-level command runner.

.PHONY: help dev dev-pro sync build test test-py clean

help:
	@echo "BeatOS targets:"
	@echo "  make dev            — run uv sync, then electron-vite dev"
	@echo "  make dev-pro        — dev with the private Pro engine (sync → install engine → dev)"
	@echo "  make sync           — uv sync (resolve Python workspace)"
	@echo "  make test           — run Python tests (pytest)"
	@echo "  make test-py        — uv run pytest packages/"
	@echo "  make build          — typecheck + electron-vite build (apps/desktop)"
	@echo "  make clean          — remove build artifacts"

dev:
	bash scripts/dev.sh

dev-pro:
	bash scripts/dev-pro.sh

sync:
	uv sync

test: test-py

test-py:
	uv run pytest packages/ -v

build:
	cd apps/desktop && npm run build

clean:
	rm -rf apps/desktop/out apps/desktop/dist apps/desktop/release
	find . -type d -name __pycache__ -exec rm -rf {} +
