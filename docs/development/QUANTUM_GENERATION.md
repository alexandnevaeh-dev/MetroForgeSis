# Quantum local generation contract

Quantum Divergence is MetroForge's separate third genre: `QUANTUM_SIMULATION_ROGUELITE`. The agreed Copilot direction is hybrid authored landmarks with seeded destructible material terrain, mysterious sci-fi, light knowledge/loadout progression, deterministic 60 Hz simulation, two swappable programmable instruments and connected branching biomes. The Probability Mines candidate implements only part of that design.

## Current creation path

MetroForge's New Game screen exposes a distinct Quantum choice. It routes through the ordinary desktop generation queue, preload IPC and `GenerationPipeline.run`, which dispatches to `runQuantumGeneration` before the generic room/AI pipeline. Current supported options are **LOCAL_ONLY, TINY_TEST and Godot**. AI-directed content, expanded profiles, Unity/Unreal ports, resume, topology/legacy visual overrides and interactive review pauses are rejected explicitly. Existing projects are preserved rather than replaced.

Titles, descriptions and integer seeds (including zero) reach the generated configuration. Blank, fractional, negative or overflowing Quantum seeds are rejected in the UI and strict backend schema. Quantum uses its own runtime template and original candidate artwork; it never falls back to top-down or Metroidvania assets. Atomic assembly verifies the template manifest and all admitted file hashes before committing a new project. Desktop progress events are buffered per job until assembly creates that destination; recording progress must not pre-create the folder.

The native entry builds the actual selected seed, fingerprints its initial material grid and reports eight authored regions with physically connected branches. It does not invent generic room scenes. Native validation imports the generated project, verifies its configuration and terrain fingerprints, then drives the actual gameplay controls through 161 waypoints, both optional branches, enemy/boss attacks, objectives and living extraction. Ground contacts and all six core animation states per enemy family are checked. Run progress currently resets on close; full connected-world suspension remains unfinished.

File creation and test results are distinct. Missing/skipped Godot validation is **Tests pending**, failed validation retains files and reports **Tests failed**, and **Tests passed** requires runtime validation. Passing candidate tests is not final artwork approval, stable 60 FPS certification or a completed application. Normal Windows creation now exports the release game, copies its executable, console wrapper and PCK away from the source folder, and verifies the full native route before marking standaloneBuild or export as passed. The result panel displays the verified build location. Missing runtime validation leaves export skipped.

## Evidence

- `reports/game-tests/20261001-quantum-divergence/generation-latest.json`: 31 dedicated backend checks, including unsupported paths, tampered template rejection, same-seed reproduction, changed-seed terrain, native generated-project gameplay and a fully decoded native recording. The generated game is **The Lattice Expedition**, seed 42. This recording shows native gameplay, not desktop interaction.
- `scripts/verify-quantum-create-ui.mjs`: **24 checks passed** in `reports/game-tests/20261002-quantum-create-ui/1790928603272/proof.json`. Hidden real Electron workflow uses Playwright DOM input and the normal preload connection, with no mocked generator and no OS-level input. It created **Quantum UI Expedition**, preserved seed **0** through actual native terrain generation, completed all 161 waypoints and extracted with 76 HP. Both optional branches, enemy families and boss attacks passed the native gate. The app displayed Tests passed only afterward. Duplicate submission, same-title preservation, keyboard genre selection, inline invalid seeds, stable busy button width, unique final progress rows, preserved failed drafts, failed queue state and a 1000x720 layout were verified. Five screenshots and exact source/bundle hashes accompany the proof. Its current run pointer is `reports/game-tests/20261002-quantum-create-ui/latest.json`; inspect `passed`, not merely the existence of captures.
- Focused creation/event/queue/genre tests: 29 tests passed on 2026-10-02, including preservation of zero seeds and progress history across atomic assembly. Desktop native build and renderer/main typechecks passed after the event-order and final progress-display fixes.
- `reports/game-tests/20261002-quantum-create-ui/strict-audit.json`: full desktop source audit currently reports nine historical/shared-control findings, including shared buttons whose forwarded handlers the static scanner cannot detect. No changed creation-screen finding remains. This is not an application-wide UI compliance pass.

## Remaining work

Final artwork admission, deeper biome generation, complete weapon aiming layers, programming UI, audio, durable full-world saves, deeper Quantum editor and export-screen integration and broader engine ports remain incomplete. The reconciled generation batch was confirmed on GitHub as commit 10b16a035825e476839fa44ea030e7adf37fa868 on 2026-10-03. Unrelated legacy pipeline edits remain in the canonical working tree for dedicated reconciliation.

## Reconciled publication batch

The exact publication source has its own fresh 31-check backend proof, 29-test regression report and 24-check real desktop workflow proof. See [the publication verification](../verification/quantum-generation-20261002/README.md). Source/bundle hashes and capture files belong to that isolated version; older canonical working-tree proofs are separate. The two earlier screenshot runs remain recorded as failed. Publication was uploaded and its GitHub branch ref verified on 2026-10-03 at commit 10b16a035825e476839fa44ea030e7adf37fa868. Unrelated legacy AI-progress, async QA-worker, failed-runtime classification and early-preview changes remain in the canonical working tree for dedicated reconciliation and validation.

## Duplicate-name history preservation

A rejected pre-job request now leaves completed game history unchanged while retaining early events for real jobs. The exact isolated follow-up passed 31 focused regressions and 24 real-app checks, including preservation of every generated file after rejection and native 161-waypoint living extraction. See [the follow-up proof](../verification/quantum-collision-20261003/README.md). Backend source and template hashes remain identical to the preceding publication.

## Windows release package

The exact isolated export snapshot passed 35 regressions, 34 backend checks and 25 real-app workflow checks. Both the source project and copied release package completed 161 waypoints with living extraction. Release initialization now runs outside assertions, and original raw scripts/manifests/PNG dependencies are packed with bound hashes. See [the release proof](../verification/quantum-export-20261003/README.md). Full-world saves, deeper programming, final art/audio and other engine ports remain pending.
