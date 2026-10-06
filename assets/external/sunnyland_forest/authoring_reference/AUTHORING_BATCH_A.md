# Batch A: Core Movement

Deliver four transparent PNG horizontal strips to `authored_incoming/`: walk (6x64), run (8x64), jump_start (3x64), land (3x64). Use `SUNNYLAND_CHARACTER_REFERENCE.png`, `sunnyland-player-palette.json`, `CHARACTER_PROPORTIONS.md`, and the corresponding briefs.

Gameplay targets: walk 12fps loop; run 14fps loop; jump_start 12fps non-loop with short anticipation; land 14fps non-loop over the controller's 0.18s landing visual window. Grounded frames use baseline Y=63 ±1. Review transitions as idle -> walk -> run, idle -> jump_start -> jump, and fall -> land -> idle.
