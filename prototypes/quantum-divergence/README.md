# Quantum Divergence mechanics playground

This isolated native Godot prototype starts the third MetroForge genre: a side-view quantum simulation roguelite. It has its own rules and tests and does not reuse either existing game's assets, levels, or controllers.

Current implementation: fixed 60Hz microcell simulation, falling sand, flowing fluid, seeded unstable ore, double-buffered bounded heat, immutable borders/anchors, temporary collapse protection, full actor clearance checks, and simulation snapshot/resume. The interactive native playground adds movement, jump, bounded levitation, run, dash, two instruments, material collision, target damage, one-second Recall, a protected safe entry and actual rendered captures.

This is **not yet a completed app-generated game or biome**. The current art is original programmatic test art. Enemy families, objectives, final assets and sprite animations, programming UI, complete save files, chunk activation and app generation integration remain to be implemented. The current whole-grid reference implementation has a 262,144-cell limit; the full biome requires chunked simulation and measured optimization.

Double-click `Run Quantum Playground.cmd` in this folder to play. Controls: A/D move, Shift run, Space jump/hold to levitate, Ctrl dash, mouse aim/fire, Q swap instruments, hold R to Recall, Esc pause/resume.

The driver `scripts/verify-quantum-playground.mjs` runs both native behavior suites (27 material checks and 26 movement/instrument checks) and a 450-tick rendered control run, saving three genuine viewport captures. `scripts/record-quantum-playground.mjs` records the same native viewport using Godot's movie writer and the existing E: FFmpeg runtime; its scripted controls and recording timing are not proof of a manual app generation playthrough or final animation quality.

Run native behavior tests using the installed E: Godot console:

```powershell
$env:TEMP = 'E:\MetroForgeData\Temp'
$env:TMP = $env:TEMP
$env:APPDATA = 'E:\MetroForgeData\AppData\QuantumGodot'
$env:LOCALAPPDATA = 'E:\MetroForgeData\AppData\QuantumGodotLocal'
& 'E:\MetroForgeData\Godot\4.6\Godot_v4.6-stable_win64_console.exe' --headless --path 'E:\Metroforge\MetroForge-Publish\prototypes\quantum-divergence' --script res://tests/SimulationTests.gd --log-file 'E:\Metroforge\MetroForge-Publish\reports\game-tests\20261001-quantum-divergence\simulation.log'
```

The canonical design and implementation checklist are in [the genre brief](../../docs/development/QUANTUM_DIVERGENCE.md).
