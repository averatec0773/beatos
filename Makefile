# Makefile for [PROJECT_NAME]
# Common project commands. Run `make help` to see all available targets.

.PHONY: help setup test build deploy clean

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'

setup: ## Set up local development environment
	@echo "See skills/setup/SKILL.md for setup instructions"

test: ## Run tests
	@echo "Replace with your test command"

build: ## Build the project
	@echo "Replace with your build command"

deploy: ## Deploy (read skills/deploy/SKILL.md first)
	@echo "See skills/deploy/SKILL.md before deploying"

clean: ## Clean build artifacts
	@echo "Replace with your clean command"
