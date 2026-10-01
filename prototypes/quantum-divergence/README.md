# Quantum Divergence mechanics playground

This isolated native Godot prototype starts the third MetroForge genre: a side-view quantum simulation roguelite. It has its own rules and tests and does not reuse either existing game's assets, levels, or controllers.

Current implementation: fixed 60Hz microcell simulation, falling sand, flowing fluid, seeded unstable ore, double-buffered bounded heat, immutable borders/anchors, temporary collapse protection, full actor clearance checks, and simulation snapshot/resume. The interactive native playground adds movement, jump, bounded levitation, run, dash, two instruments, material collision, target damage, one-second Recall, a protected safe entry and actual rendered captures.

The progression control adds regional anchoring, three rift crystals damaged by real projectiles, permanent ghost-platform stabilization with actor-clearance preflight, defeated-Golem/core gates, a one-time blueprint/heal reward and extraction requiring every objective. The Golem is a stationary combat target in this control; its attack AI remains pending.

The separate live encounter control adds Skitter dash, Wraith shots and glide, Driller terrain carving and a Golem cycling through timed slam/burst/roar attacks. It shares authoritative target HP, actor occupancy and the global projectile budget with the player. Player hit/death and bounded immunity apply to actual enemy damage. All four families can be defeated while completing the three objectives and extracting.

The live encounter now includes durable E:-resident run/profile files, suspend/resume, automatic recovery of a valid suspend at launch and a fresh run after death/extraction. F5 saves and pauses; F9 validates and restores the complete run before swapping it in; Escape continues a paused game. Enter starts a fresh run after death or extraction. Health, energy, actors, objectives and materials reset; only allowed blueprint/loadout/lore knowledge persists. Eight complete generations per profile/run group are retained; corrupt or incomplete candidates cannot partially replace gameplay, and death markers prevent fallback to an older living run. Default saves are under `E:/MetroForgeData/GameSaves/QuantumDivergence/profile-01`; automated controls use separate report directories.

This is **not yet a completed app-generated game or biome**. The current art is original programmatic test art. Final character/terrain assets and sprite animations, production world dressing and a full-world combat playthrough, programming UI, production audio and app generation integration remain unfinished. The compact reference kernel has a 262,144-cell limit; the new connected-world preview uses bounded active chunks over 1,382,400 cells. Durable run saves currently support the 192x96-cell encounter world only.

Double-click `Run Quantum Playground.cmd` in this folder to play. Controls: A/D move, Shift run, Space jump/hold to levitate, Ctrl dash, mouse aim/fire, Q swap instruments, hold R to Recall, Esc pause/resume.

The driver `scripts/verify-quantum-playground.mjs` runs five native behavior suites (27 material, 29 movement/instrument, 31 progression, 43 enemy and 54 save/session checks; 184 total) and a 450-tick rendered mechanics control, saving three genuine viewport captures. `scripts/verify-quantum-progression.mjs` separately walks the stationary progression control through anchoring, the secret, all crystal impacts, the 300-HP target, core stabilization and extraction. The seeded liquid shield intercepts two shots; its exact accepted proof is 33 shots, 31 damaging hits and two real liquid impacts, with all gates complete.

Double-click `Run Probability Progression.cmd` to play the progression control. Movement/firing controls are the same; E interacts with a nearby node. Destroy all three purple rift crystals, defeat the stationary Golem target, interact with its core and use the lift. The HUD explicitly labels this as a progression control with stationary targets.

Double-click `Run Live Mine Encounters.cmd` for actual enemy encounters and boss combat. `scripts/verify-quantum-combat.mjs` requires all four enemies to die, every enemy to reach an active attack, all three Golem attacks to reach their active frames, all objectives/secret to complete and the living player to extract. The recorded control uses normal movement/fire/interaction inputs and no test health or invulnerability grants. Its first successful run ended at HP 44 after 41 shots, including one material impact.

`scripts/record-quantum-playground.mjs` records the mechanics control using Godot's movie writer and the existing E: FFmpeg runtime; add `--progression` for the stationary objective control `--combat` for the live encounter walkthrough, or `--save` for the suspend/resume and enemy-caused death/restart control. The MP4 is fully decoded as a verification step. Scripted controls and fixed recording timing are not proof of manual app generation, final animation quality or full-biome performance.

Run native behavior tests using the installed E: Godot console:

```powershell
$env:TEMP = 'E:\MetroForgeData\Temp'
$env:TMP = $env:TEMP
$env:APPDATA = 'E:\MetroForgeData\AppData\QuantumGodot'
$env:LOCALAPPDATA = 'E:\MetroForgeData\AppData\QuantumGodotLocal'
& 'E:\MetroForgeData\Godot\4.6\Godot_v4.6-stable_win64_console.exe' --headless --path 'E:\Metroforge\MetroForge-Publish\prototypes\quantum-divergence' --script res://tests/SimulationTests.gd --log-file 'E:\Metroforge\MetroForge-Publish\reports\game-tests\20261001-quantum-divergence\simulation.log'
```

The canonical design and implementation checklist are in [the genre brief](../../docs/development/QUANTUM_DIVERGENCE.md).

The driver `scripts/verify-quantum-save.mjs` verifies a live hostile projectile survives a complete suspend/resume at the exact same tick, a fresh session loads the saved run and blueprint knowledge, real enemy damage ends the run, disk and in-memory death markers block old-run resurrection, and explicit restart restores the baseline while retaining earned knowledge. Its rendered proof is separate from the full objective walkthrough.

The new **Run Probability Mines World.cmd** launches a separate intended-size connected mine: eight authored landmarks, seeded material pockets, safe stations, live enemy placement, camera-relative aiming and the same three objective rules. Materials run in bounded awake chunks; sleeping matter, heat and enemy phase clocks retain their state. The 184 compact checks are joined by 23 chunk/actor/precision and ten full-world generation/traversal checks (217 total). `scripts/verify-quantum-world.mjs` walks the complete main backbone using the real starting movement kit, then captures an actual rendered entry-to-upper-anchor walk. Add `--world` to the recording driver for that entry video.

The world retains original test poses. Interact with a visible station to register it for Recall. Enter after death/extraction starts a fresh world with in-memory blueprint knowledge retained; world progress is not persisted between launches yet. The working compact suspend/resume continues to use its own separate save schema.

`scripts/verify-quantum-world-victory.mjs` now proves a complete native rendered tour: all eight landmarks and stations, both optional branches outward and physically back, every enemy family and Golem attack, all three objectives, the secret blueprint, defeated-core stabilization and gated extraction. The successful tour reaches 161/161 waypoints, fires 40 damaging Photon shots and extracts with HP 76 after 6182 ticks. Six native branch checks raise the total to 223. The initial blocked echo climb and the test's premature final lift interaction remain as failed evidence; both were corrected without adding powers, health or objective bypasses. Add `--world-victory` to the movie recorder to show this complete run.

The full native prototype loop passes, while final approved sprites/animations/environment art, module programming, durable full-world saves, audio and actual MetroForge app generation remain pending. The separate top-down and Stormglass Metroidvania projects retain their own assets and levels.
