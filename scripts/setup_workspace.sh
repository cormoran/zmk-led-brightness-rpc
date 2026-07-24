#!/usr/bin/env bash
#
# Idempotent west-workspace bootstrap (isolated layout), shared by the
# devcontainer (.devcontainer/init.sh), the CI setup action
# (.github/actions/west-init/action.yml), and README "Option2". Keeping the
# init/update/export sequence in one place means a change to it (manifest
# name, an added step) is made once instead of in every caller.
#
# Usage: scripts/setup_workspace.sh [manifest-file]
#   manifest-file  Manifest passed to `west init -l west --mf ...` (resolved
#                  inside the `west/` manifest repo). Default:
#                  west-test-isolated.yml.
#
# Run from the repository root. Safe to run repeatedly: it no-ops once the
# workspace is initialized. Callers that need a git `safe.directory` entry
# (CI, container) must add it before calling this -- `west init` runs git.
set -euo pipefail

MANIFEST_FILE="${1:-west-test-isolated.yml}"

if west topdir >/dev/null 2>&1; then
    echo "* West is already initialized with topdir: $(west topdir)"
    exit 0
fi

echo "* Initializing West (manifest: ${MANIFEST_FILE})..."
west init -l west --mf "${MANIFEST_FILE}"
west update --narrow
west zephyr-export
