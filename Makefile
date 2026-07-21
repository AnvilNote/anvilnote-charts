# AnvilNote charts Makefile
# A thin wrapper around pnpm so common workflows share one entry point.
# All comments are written in plain English without parentheses.

# Use pnpm as the package manager for every target.
PM := pnpm

# Forward optional CLI arguments to the charts CLI entrypoint.
ARGS ?=

# Treat these targets as commands rather than files on disk.
.PHONY: help install dev build build-desktop start lint typecheck check format test clean reset

# Show this help message when make runs without a target.
.DEFAULT_GOAL := help

help: ## List all available targets with a short description
	@echo "AnvilNote charts - available make targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "} {printf "  \033[1m%-14s\033[0m %s\n", $$1, $$2}'

install: ## Install all project dependencies from the lockfile
	$(PM) install

dev: ## Run the charts CLI from source
	$(PM) dev -- $(ARGS)

build: ## Compile the TypeScript source into dist
	$(PM) build

build-desktop: ## Bundle the charts CLI for the desktop packaging pipeline
	$(PM) build:desktop

start: ## Run the compiled charts CLI
	$(PM) start

lint: ## Run ESLint across the whole project
	$(PM) lint

typecheck: ## Run the TypeScript compiler in no-emit mode
	$(PM) exec tsc --noEmit

test: ## Run the Node test runner suite
	$(PM) test

# Run linting and type checking together as a quick quality gate.
check: lint typecheck ## Run lint and typecheck in sequence

format: ## Format the source tree with Prettier
	$(PM) format

clean: ## Remove build output and local caches
	rm -rf dist coverage *.tsbuildinfo

# Wipe installed dependencies on top of the normal clean step.
reset: clean ## Remove node_modules in addition to build output
	rm -rf node_modules
