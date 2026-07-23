#!/bin/bash
cd "$(dirname "$0")/.."

echo "Setting up the development environment..."
echo "* Current directory: $(pwd)"

git config --global --add safe.directory "$(pwd)"

# Shared, idempotent west bootstrap (see scripts/setup_workspace.sh).
bash scripts/setup_workspace.sh

pre-commit install || cat /root/.cache/pre-commit/pre-commit.log
