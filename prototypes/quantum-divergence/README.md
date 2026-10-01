# Quantum Divergence simulation foundation

This isolated native Godot prototype starts the third MetroForge genre: a side-view quantum simulation roguelite. It has its own rules and tests and does not reuse either existing game's assets, levels, or controllers.

Current implementation: fixed 60Hz microcell simulation, falling sand, flowing fluid, seeded unstable ore, double-buffered bounded heat, immutable borders/anchors, temporary collapse protection, full actor clearance checks, and simulation snapshot/resume.

This is **not yet a playable generated game**. Player movement, actual recall input/teleport, projectile combat, enemies, objectives, artwork, animations, UI, complete save files, chunk activation and app generation integration remain to be implemented. The current whole-grid reference implementation has a 262,144-cell limit; the full biome requires chunked simulation and measured optimization.

Run native behavior tests using the installed E: Godot console:

```powershell
$env:TEMP = 'E:\MetroForgeData\Temp'
$env:TMP = $env:TEMP
$env:APPDATA = 'E:\MetroForgeData\AppData\QuantumGodot'
$env:LOCALAPPDATA = 'E:\MetroForgeData\AppData\QuantumGodotLocal'
& 'E:\MetroForgeData\Godot\4.6\Godot_v4.6-stable_win64_console.exe' --headless --path 'E:\Metroforge\MetroForge-Publish\prototypes\quantum-divergence' --script res://tests/SimulationTests.gd --log-file 'E:\Metroforge\MetroForge-Publish\reports\game-tests\20261001-quantum-divergence\simulation.log'
```

The canonical design and implementation checklist are in [the genre brief](../../docs/development/QUANTUM_DIVERGENCE.md).
