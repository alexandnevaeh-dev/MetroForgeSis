#!/usr/bin/env bash
# Windowed Metal visual / motion / perf captures. Never pass --headless.
set -euo pipefail

for arg in "$@"; do
  if [[ "$arg" == "--headless" ]]; then
    echo "CAPTURE_REFUSED: dummy renderer cannot capture screenshots or motion. Relaunch windowed without --headless (Metal Forward+)." >&2
    exit 2
  fi
done

GODOT="${GODOT:-/Users/alexisforrest/Applications/Godot.app/Contents/MacOS/Godot}"
PROJ="${1:-.}"
SCENE="${2:-res://scenes/test/WorldVisualCapture.tscn}"
QUIT_MS="${QUIT_MS:-240000}"

exec "$GODOT" --path "$PROJ" --quit-after "$QUIT_MS" "$SCENE"
