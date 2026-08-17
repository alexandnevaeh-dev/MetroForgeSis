#!/usr/bin/env bash
# MetroForge AI — Cloud Agent bootstrap (idempotent).
#
# Repo-managed because the repository's default branch (main) is empty: the actual monorepo
# lives on feature branches, so the environment must travel with the code on the branch rather
# than being pinned to a DB-managed snapshot of an empty main.
#
# Runs from /workspace after checkout. Must terminate and be safe to re-run.
set -euo pipefail

# 1. Pin + activate pnpm and install workspace dependencies. CI=true keeps pnpm non-interactive
#    (it will recreate node_modules without a TTY prompt if the store/version differs).
corepack enable
CI=true pnpm install --frozen-lockfile

# 2. Godot 4.3 (headless-capable) for runtime validation and the QA gates. Installed to a
#    user-writable location that the tools' Godot resolver already probes (~/.local/bin/godot),
#    so no sudo/root is required. Skipped when any Godot is already available.
GODOT_VERSION="4.3-stable"
GODOT_ASSET="Godot_v4.3-stable_linux.x86_64"
GODOT_BIN="${HOME}/.local/bin/godot"
if command -v godot >/dev/null 2>&1 || command -v godot4 >/dev/null 2>&1 || [ -x "${GODOT_BIN}" ]; then
  echo "Godot already available — skipping download."
else
  echo "Installing Godot ${GODOT_VERSION} to ${GODOT_BIN} ..."
  mkdir -p "${HOME}/.local/bin"
  tmp="$(mktemp -d)"
  curl -fsSL -o "${tmp}/godot.zip" \
    "https://github.com/godotengine/godot/releases/download/${GODOT_VERSION}/${GODOT_ASSET}.zip"
  unzip -o "${tmp}/godot.zip" -d "${tmp}" >/dev/null
  mv "${tmp}/${GODOT_ASSET}" "${GODOT_BIN}"
  chmod +x "${GODOT_BIN}"
  rm -rf "${tmp}"
  echo "Godot installed: $(${GODOT_BIN} --version --headless 2>/dev/null | tail -1 || echo 'installed')"
fi
