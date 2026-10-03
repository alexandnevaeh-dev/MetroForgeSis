# Quantum publication verification

This batch was prepared from published parent d0e155edfedbc25e00ad1386363fdfaa32134944. The original working source and index were preserved. Existing third-party dependencies remained on E:, and every MetroForge workspace import used the isolated publication packages.

The reconciled source compiled and the desktop native build passed. The exact source/bundle fingerprints are in the backend and app proofs. All 31 backend checks, 29 regression tests and 24 real hidden Electron workflow checks passed. The app used normal preload IPC, created a fresh seed-zero game, traversed all 161 waypoints and extracted alive with 76 HP. No generator mock or OS-level input was used.

Two earlier runs completed creation/gameplay and 21 checks, then timed out capturing the narrow view. They remain failed runs; their checks were not substituted for this fresh complete run. The test harness now uses Electron capturePage with stayHidden/stayAwake, waits for real frames and finite layout transitions, and records exact capture/viewport dimensions. Production app settings remain unchanged.

See the five screenshots for ready, busy, successful result, collision preservation and narrow layout. The JSON records include E:-resident machine paths for locating local artifacts; recreate fresh proofs with the verification scripts after cloning on E:. Videos and generated projects remain local and are not included in this source batch.

The full desktop static audit still reports 9 historical/shared-control findings. No creation-screen finding remains. This is not a full application compliance pass. Quantum remains a Godot local Probability Mines candidate: final visual approval, AI content generation, instrument programming, deeper biomes, production audio, durable full-world saves, editor/engine ports and standalone export remain unfinished. Top-down and Metroidvania sets remain separate.
