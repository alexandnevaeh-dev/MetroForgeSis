#!/usr/bin/env bash
# Headless-safe checks: CombatMicroTest, PlaytestRunner, BossDeathLifecycleTest.
# Not for screenshots or motion.
set -euo pipefail

GODOT="${GODOT:-/Users/alexisforrest/Applications/Godot.app/Contents/MacOS/Godot}"
PROJ="${1:-.}"
SCENE="${2:-res://scenes/test/CombatMicroTest.tscn}"
QUIT_MS="${QUIT_MS:-90000}"

exec "$GODOT" --headless --path "$PROJ" --quit-after "$QUIT_MS" "$SCENE"
