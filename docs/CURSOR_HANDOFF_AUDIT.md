# Cursor Handoff Audit — 2026-08-13

Audit performed at Cursor takeover. Source code is authoritative over stale doc claims.

## Baseline validation (latest)

| Check | Result |
|-------|--------|
| `pnpm build` | **PASS** |
| `pnpm test` | **PASS** — 259/259 (59 files) |
| Godot | **Available** — 4.7.1.stable (`pnpm metroforge doctor`) |
| Ollama / FFmpeg / NVIDIA | Not configured (expected for LOCAL_ONLY) |

## Recently completed (2026-08-12 — 2026-08-13)

| Area | Evidence |
|------|----------|
| Modular ability framework | 9 registered abilities with Godot runtime (dash → phase) |
| Boss telegraph/recovery | `BossController.gd` reads per-phase `telegraphDuration` / `recoveryWindow` |
| Playtest personas + telemetry | `playtest-persona.ts`, `PlaytestAgent.gd`, `playtest_telemetry.json` |
| Dashboard playtest panel | `ProjectDashboard.tsx` + `project-loader.ts` |
| Movement-feasibility QA | `movement-feasibility.ts` + `movement_feasibility` static gate |
| Extended world objects | GrapplePoint, WaterZone, PhaseBarrier room placements |
| COMMERCIAL_SAFE mode | `mode-routing.ts` + license router |
| Automatic runtime validation | Default pipeline runs `godot_runtime` + `godot_playtest` |
| Security fixes | `resolveProjectPathSafe()`, `assertSafeModelIdentifier()` |

## Claude work — verified complete (preserve)

| Area | Evidence |
|------|----------|
| Godot runtime smoke harness | `RuntimeSmokeTest.gd`, live checks in audit |
| Generation pipeline + assembly | End-to-end TINY_TEST output under `GeneratedGames/` |
| Text/image routing consolidation | `GenerationRouter`, `ImageProviderRegistry` |
| NVIDIA NIM provider | `providers/nvidia.ts` + tests |
| World reachability QA | `validateWorldReachability`, ability-gate duplicate-edge bug fixed |
| Combat loop | Player damages enemies/bosses; boss phases/attacks |
| Save/load, death/respawn | `SaveManager` (3 slots + file select), `GameManager`, `DeathOverlay` |
| Quests (Reach, BossKill) | `QuestManager` + NPC quest giver |
| Multi-boss placement | Per-arena `boss_id` from generated data |
| Path safety | `resolveProjectPathSafe()` + tests |

## Still partial / next backlog

| Area | Gap |
|------|-----|
| Room archetype fidelity | **Fixed** — `worldArchetype` + `room_archetype_fidelity` gate |
| Quest objective breadth | **Fixed** — all 10 schema types generated + tracked |
| Map/minimap | **Working** — `MapManager` + pause-menu `WorldMapPanel` + corner HUD `MinimapPanel` |
| Quest log | **Working** — pause-menu `QuestPanel` + HUD `QuestTrackerPanel` (active quests) |
| Equipment | **Working** — relics (max HP), charms (attack), keys, upgrade materials; shops sell charms |
| Boss music / buses | **Working** — `AudioManager` Master/Music/SFX buses; boss arenas swap to `boss` track |
| P2 AI | Embeddings/RAG live; img2img conditioning; Piper TTS + Whisper ASR in desktop CommandBar |
| Tile-accurate playtest physics | Movement-feasibility is reach audit, not collision sim |
| Database tables | `artifacts`, `validation_results` underused |
| Regenerate old projects | **Fixed** — `metroforge project refresh-template` copies runtime template + removes AbilityGate/AssetSprite orphans |

## Test counts

- Current: **313/313 tests passing** (70 files), clean build.

## Godot runtime

Automatic runtime validation runs on every `create`/`generate` when Godot is on PATH. Opt-out: `--skip-runtime-validation`. `validate` runs runtime by default; opt-out: `--no-runtime`.
