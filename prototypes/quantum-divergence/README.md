# Quantum Divergence mechanics playground

This isolated native Godot prototype starts the third MetroForge genre: a side-view quantum simulation roguelite. It has its own rules and tests and does not reuse either existing game's assets, levels, or controllers.

Current implementation: fixed 60Hz microcell simulation, falling sand, flowing fluid, seeded unstable ore, double-buffered bounded heat, immutable borders/anchors, temporary collapse protection, full actor clearance checks, and simulation snapshot/resume. The interactive native playground adds movement, jump, bounded levitation, run, dash, two instruments, material collision, target damage, one-second Recall, a protected safe entry and actual rendered captures.

The progression control adds regional anchoring, three rift crystals damaged by real projectiles, permanent ghost-platform stabilization with actor-clearance preflight, defeated-Golem/core gates, a one-time blueprint/heal reward and extraction requiring every objective. The Golem is a stationary combat target in this control; its attack AI remains pending.

This is **not yet a completed app-generated game or biome**. The current art is original programmatic test art. Enemy families, final assets and sprite animations, the full world generator, programming UI, durable profile/run save files, death/reset, chunk activation and app generation integration remain to be implemented. The current whole-grid reference implementation has a 262,144-cell limit; the full biome requires chunked simulation and measured optimization.

Double-click `Run Quantum Playground.cmd` in this folder to play. Controls: A/D move, Shift run, Space jump/hold to levitate, Ctrl dash, mouse aim/fire, Q swap instruments, hold R to Recall, Esc pause/resume.

The driver `scripts/verify-quantum-playground.mjs` runs all three native behavior suites (27 material, 29 movement/instrument and 31 progression checks) and a 450-tick rendered mechanics control, saving three genuine viewport captures. `scripts/verify-quantum-progression.mjs` separately walks the progression control through anchoring, the secret, all crystal impacts, the 300-HP stationary target, core stabilization and extraction. The seeded liquid shield intercepts two shots; the exact accepted proof is 33 shots, 31 damaging hits and two real liquid impacts, with all gates complete.

Double-click `Run Probability Progression.cmd` to play the progression control. Movement/firing controls are the same; E interacts with a nearby node. Destroy all three purple rift crystals, defeat the stationary Golem target, interact with its core and use the lift. The HUD explicitly labels this as a progression control with stationary targets.

`scripts/record-quantum-playground.mjs` records the mechanics control using Godot's movie writer and the existing E: FFmpeg runtime; add `--progression` to record the objective walkthrough. The MP4 is fully decoded as a verification step. Scripted controls and fixed recording timing are not proof of manual app generation, finished enemy AI or final animation quality.

Run native behavior tests using the installed E: Godot console:

```powershell
$env:TEMP = 'E:\MetroForgeData\Temp'
$env:TMP = $env:TEMP
$env:APPDATA = 'E:\MetroForgeData\AppData\QuantumGodot'
$env:LOCALAPPDATA = 'E:\MetroForgeData\AppData\QuantumGodotLocal'
& 'E:\MetroForgeData\Godot\4.6\Godot_v4.6-stable_win64_console.exe' --headless --path 'E:\Metroforge\MetroForge-Publish\prototypes\quantum-divergence' --script res://tests/SimulationTests.gd --log-file 'E:\Metroforge\MetroForge-Publish\reports\game-tests\20261001-quantum-divergence\simulation.log'
```

The canonical design and implementation checklist are in [the genre brief](../../docs/development/QUANTUM_DIVERGENCE.md).
