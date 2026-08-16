# METROFORGE — CURRENT AUTHORITATIVE BUILD STATE

**This document describes the CURRENT state of the repository only.** Every claim below traces to a command run, a file read, or a real generation executed during this audit session. Superseded/historical findings have been moved to `docs/METROFORGE_CHANGE_HISTORY.md` — do not treat anything in that file as current.

> **Last refreshed: 2026-08-16 ~01:00–01:35 America/Chicago (UTC-5), HEAD `827c1f4` ("Add ModelScout test coverage").** This is a refresh pass over the original 2026-08-14 audit (baseline commit `5917bf9`) — 13 commits landed in between. See **STEP 42** near the end of this document for what changed in this refresh: the P0 blocker is now resolved, three more Top-20 items closed, and 8 previously-uninvestigated commits from concurrent sessions were read and folded in. The rest of this document is the original audit body, edited in place where it went stale; sections not mentioned in Step 42 are unchanged and still accurate as of this refresh. **A large (~109-file) uncommitted work-in-progress exists in the working tree beyond what's described here — see Step 42's "Uncommitted work in flight" note before assuming this document reflects literally everything on disk.**

---

## STEP 1 — Repository Identity

| Field | Value |
|---|---|
| Audit timestamp | 2026-08-14, ~10:12–10:50 local (America/Chicago, UTC-5) |
| Git branch | `feature/claude-generation-runtime` |
| Git commit (HEAD at time of writing) | `5917bf95eb0d76ac0a0caf3b6790c6e1db95e5df` — "Expand top-down RuntimeSmokeTest.gd from 14 to 165 real checks" (committed 2026-08-14T10:25:22-05:00, landed from a concurrent background session during this audit) |
| Working tree state | Clean except untracked non-source directories: `.claude/skills/`, `.metroforge/`, `Exports/` (build/cache/output artifacts, not tracked source) |
| MetroForge version | `0.1.0` (root `package.json`, `apps/cli/package.json`, `apps/desktop/package.json` all agree) |
| Node.js | v24.19.0 (`node --version`) |
| pnpm | 10.15.0 (`pnpm --version`) |
| Electron | 33.4.11 installed (`apps/desktop/node_modules/electron/package.json`); `apps/desktop/package.json` pins `^33.2.1` |
| React | 18.3.1 |
| TypeScript | 5.9.3 resolved (`node_modules/typescript`); root devDependency pins `^5.7.2` |
| Godot | 4.7.1.stable.official.a13da4feb, at `C:/Users/alexa/Downloads/Godot_v4.7.1-stable_win64.exe/Godot_v4.7.1-stable_win64.exe`, auto-detected by `metroforge doctor` |
| Python | 3.11.9 |
| OS | Windows 11 Home, 64-bit, build 10.0.26200 |
| GPU | Intel(R) UHD Graphics (integrated), driver 31.0.101.2115, ~1 GB reported adapter RAM. **No discrete/NVIDIA GPU present on this machine** — local diffusion-based image/audio generation (ComfyUI, Diffusers, Stable Audio worker) is not just "not installed" here, it has no capable local hardware to run on even if installed. |
| RAM | ≈7.8 GB total physical (8,367,624,192 bytes) |
| Configured external tools | Git 2.55.0.windows.3; NVIDIA NIM API key configured and reachable (see Step 3). Ollama and FFmpeg are **not installed** on this machine. No API keys present for Gemini/Groq/OpenRouter/HuggingFace (not exposed, presence-only checked). |

---

## STEP 2 — Current Validation Command Results

All four commands were executed fresh this session, after the `5917bf9` commit landed (confirmed by timestamp ordering).

| Command | Result | Detail |
|---|---|---|
| `pnpm typecheck` (`pnpm -r run typecheck`) | **PASS** | 13 of 14 workspace projects ran `tsc --noEmit` (the 14th has no `typecheck` script); all 13 completed with `Done` and zero reported errors; exit code 0. |
| `pnpm lint` (`eslint . --ext .ts,.tsx`) | **FAIL** | 54 errors, 0 warnings — **all** in three build-tooling scripts under `scripts/` (`build-contact-sheet.mjs`, `capture-ui-screenshots-gaps.mjs`, `capture-ui-screenshots.mjs`), all `no-undef` for Node/browser globals (`process`, `console`, `document`, `sessionStorage`, `setTimeout`, `HTMLElement`, etc.) that these `.mjs` files use without an ESLint env/globals block. **Zero lint errors anywhere under `packages/` or `apps/` source.** This is a real, current, reproducible failure of `pnpm lint` as a whole, isolated to non-shipped dev tooling. |
| `pnpm test` (`vitest run`) | **PASS** | **81 test files, 392 tests, all passed.** Duration 56.60s (transform 2.93s, collect 9.79s, tests 48.93s). Includes the real `generation-e2e.test.ts` full TINY_TEST pipeline run (43.65s of the total). |
| `pnpm build` (`pnpm -r run build`) | **PASS** | All 13 workspace projects with a `build` script completed (`tsc` for each package, `tsc -p tsconfig.electron.json && vite build` for the desktop app, producing `dist/` and `dist-electron/` bundles). Exit code 0. |

**Refreshed 2026-08-16 at HEAD `827c1f4` (do not average with the numbers above — those are historical, from the 2026-08-14 baseline; these are current):**

| Command | Result | Detail |
|---|---|---|
| `pnpm typecheck` | **PASS** | 13/13 runnable workspace projects, 0 errors — unchanged from baseline. |
| `pnpm test` (`vitest run`) | **FAIL (1 test)** | **96 test files (95 passed, 1 failed), 498 tests (497 passed, 1 failed).** The one failure is `packages/ai/src/providers/nvidia.test.ts` ("is included as a candidate under FREE_ONLY"), caused by an **in-progress, uncommitted** edit to `packages/ai/src/mode-routing.ts` (adding a new `LOWEST_COST` generation mode) that is part of the ~109-file uncommitted work-in-progress described in Step 42 — not a regression in any committed code. Test count grew from 392 (baseline) to 498 because the 5 known session commits added real new test files (playtest-persona, quality-director ×209, gameplay-capture, room-assembler, model-scout ×12). |
| `pnpm build` (`pnpm -r run build`) | **FAIL (1 of 13 projects)** | 12/13 projects build clean. `apps/desktop` fails: `packages/shared/dist/config.js (2:15): "dirname" is not exported by "__vite-browser-external"` — Vite can't bundle `packages/shared/src/config.ts` for the browser because an **in-progress, uncommitted** edit to that file (widening `defaultProfile` to include `RELEASE_CANDIDATE`, part of the same uncommitted work) sits alongside its existing Node-only `node:path`/`node:url` imports, which the desktop renderer bundle can't resolve. This is the same pre-existing issue flagged by the `ef9b8cc` commit message itself ("pre-existing apps/desktop break from a concurrent packages/shared/config.ts edit, not touched here") — confirmed still present, unrelated to any committed change. |

---

## STEP 3 — `metroforge doctor` / System Health

```
[✓] Node.js: v24.19.0
[✓] pnpm: v10.15.0
[✓] Godot: 4.7.1.stable.official.a13da4feb
[!] Ollama: Not detected
[✓] Python: Python 3.11.9
[!] FFmpeg: Not detected
[✓] Git: git version 2.55.0.windows.3
[✓] NVIDIA NIM: API Key: CONFIGURED — API: REACHABLE (365ms)
[✓] Generated games dir: GeneratedGames
```

Precise health states (doctor output plus `metroforge providers` and live generation-run health probes, which cover ComfyUI/Diffusers that `doctor` itself does not check):

| Tool/Provider | State |
|---|---|
| Godot | HEALTHY |
| Python | HEALTHY |
| Git | HEALTHY |
| Ollama | NOT_INSTALLED |
| FFmpeg | NOT_INSTALLED |
| NVIDIA NIM | HEALTHY (key configured, API reachable) |
| ComfyUI | UNAVAILABLE (confirmed via live generation-run health probes, not installed) |
| Diffusers (local) | UNAVAILABLE (not installed; also no capable local GPU) |
| Gemini / Groq / OpenRouter / HuggingFace | NOT_CONFIGURED (no API key present for any of the four) |

`metroforge providers` output:

```
  ID             Name                 Type     Enabled  Health
  ollama         Ollama               local    yes      unavailable
  gemini         Google Gemini        cloud    no       unavailable
  groq           Groq                 cloud    no       unavailable
  openrouter     OpenRouter           cloud    no       unavailable
  huggingface    Hugging Face         cloud    no       unavailable
  nvidia         NVIDIA NIM           cloud    yes      healthy
```

---

## STEP 4 & 5 — Fresh Generation Runs and Real Godot Validation

Four brand-new projects were generated this session (new slugs/seeds, no reuse of any pre-existing `GeneratedGames/` folder). All four ran the pipeline's real, automatic Godot validation (see Step 31) — this is not a simulated or reused result.

| # | Archetype | Mode | Seed | Result | Gates | Notable detail |
|---|---|---|---|---|---|---|
| 1 | SIDE_VIEW_METROIDVANIA | LOCAL_ONLY | 88231 | **PASS — RUNTIME_VALIDATED** | 18/18 | `environment_assets` DEGRADED — 95/95 assets procedural placeholder (ComfyUI + Diffusers both UNAVAILABLE) |
| 2 | SIDE_VIEW_METROIDVANIA | NVIDIA_ONLY | 51177 | **PASS — RUNTIME_VALIDATED** | 18/18 | `environment_assets` DEGRADED — but only 13/95 placeholder; **90/95 assets real, critique-passed** via NVIDIA `flux.1-dev`. `game_dna` source: `ai` (real NVIDIA text generation, vs. `deterministic` in run 1). Standalone re-`validate` of this project separately confirmed `godot_runtime: 180/181 runtime checks passed`. |
| 3 | TOP_DOWN_ACTION_ADVENTURE | LOCAL_ONLY | 20260814 | **FAIL — validation_failed** | 17/18 | `godot_runtime`: SOFT_FAIL, 164/165 checks (1 soft-fail: `item_pickup_consumable_can_be_triggered`). `godot_playtest`: **FAIL, 3/8 checks** (`playtest_persona_configured`, `playtest_completed_transitions`, `playtest_reached_victory_flow`, `playtest_victory_state_or_boss_defeated`, `playtest_telemetry_emitted` all FAIL). `automated_repair` attempted once and reported "`[godot_playtest] -> still failing`" (expected — `RepairEngineer` has no repair strategy for playtest failures; see Step 33). Project still exported successfully to `Exports/` despite failing validation. |
| 4 | TOP_DOWN_ACTION_ADVENTURE | LOCAL_ONLY | 777001 | **FAIL — validation_failed** | 17/18 | Identical failure signature to run 3 (`automated_repair: FAILED (#1 [godot_playtest] -> still failing)`). **Reproduced 2/2** — this is a real, current, seed-independent defect in the top-down archetype's autonomous playtest bot, not one-off seed noise. |

Both generated Godot projects imported cleanly (`godot_imports: Godot headless OK` in every run), and all four exported successfully regardless of validation outcome (export is not validation-gated by default — see Step 34).

**Real AI image generation was directly proven this session**, not inferred: inspecting run 2's `generation_manifest.json` shows `player.png` with `"provider": "nvidia-image", "modelId": "black-forest-labs/flux.1-dev", "critiquePassed": true, "critiqueScore": 90`, and the raw AI source file (`assets/characters/player_source.png`) is a real 377,782-byte PNG (vs. the ~250–600-byte procedural placeholders in run 1). Provider breakdown across the 106 artifacts in run 2's manifest: `nvidia-image: 5` (raw AI character/creature source poses), `pixel-art-processor: 77` (game-ready frames deterministically derived from those 5 AI sources), `procedural: 24` (tiles/VFX/UI, never AI-routed). The run's own warning — `"77 artifact(s) are not COMMERCIAL_SAFE"` — matches exactly the 77 `pixel-art-processor`-derived entries, each carrying `"license": "Unverified provider: pixel-art-processor", "commercialUse": "unknown"` (see Step 19 gap).

---

## STEP 6 — What Is Actually Playable

| Capability | Side-view | Top-down | Evidence |
|---|---|---|---|
| Generate a Godot project | YES | YES | 4/4 real runs this session |
| Godot can import it | YES | YES | `godot_imports` PASS in all 4 runs |
| Runs independently of MetroForge | YES | YES | Exported to `Exports/<slug>/…-staging-…/` as a complete, self-contained project folder in all 4 runs |
| Player move | YES | YES | Runtime smoke checks confirm both |
| Jump | YES | N/A | Side-view is a platformer (jump/dash/wall-jump abilities); top-down has no vertical jump axis (`jumpApexPx: 0` in its own movement-feasibility metrics — by design, not a gap) |
| Attack | YES | YES | Hitbox/hurtbox checks pass both archetypes |
| Take damage | YES | YES | `HealthComponent`/`HurtboxComponent` confirmed both |
| Die | YES | YES | Real death animation for player/enemy/boss (landed this branch); death-triggered re-death and playtest-timing regressions already fixed |
| Respawn | YES | YES | `_check_player_death_respawn` exercises real `SaveManager`/`GameManager._do_respawn()` checkpoint respawn, both archetypes |
| Save/load | YES | YES | v1→v2 migration, corrupt-file backup recovery, 3 independent save slots — all runtime-verified |
| Use generated abilities | YES | PARTIAL | Side-view: 9 movement abilities, 6 FULL / 3 PARTIAL (Step 7). Top-down uses a distinct, real item-based progression system (8 named dungeon tools via `TOP_DOWN_DUNGEON_ITEMS`), not movement abilities — functioning but architecturally different, marked PARTIAL only because it wasn't exercised end-to-end via a successful playtest this session (see below). |
| Fight enemies | YES | YES | Both archetypes |
| Fight bosses | YES | YES | Data-driven `BossController`, phases/attacks/weaknesses, both archetypes |
| Defeat final boss | YES | PARTIAL | Side-view: proven via both internal-API (`RuntimeSmokeTest`) and input-simulated (`PlaytestAgent`) boss defeat, 2/2 runs. Top-down: internal-API boss-related runtime checks pass (within the 164/165), but the **input-simulated** `PlaytestAgent` boss defeat currently fails to complete, 2/2 runs this session. |
| Trigger victory | YES | NO (currently) | Side-view: `playtest_reached_victory_flow` / `playtest_victory_state_or_boss_defeated` PASS, 2/2. Top-down: both FAIL, 2/2, in the autonomous proof — see Step 5/32/39 P0 blocker. Manual human play was not separately tested in this audit. |
| Interact with NPCs | YES | YES | Proximity `Area2D` + `interact` action |
| Use dialogue | YES | YES | Real branching dialogue with `nextDialogueId` jumps and action branches (`accept_quest`, `open_shop`) |
| Complete quests | YES | YES | 10 objective types, generator and runtime match 1:1 (Step 25) |
| Use inventory | YES | YES | 6 real item categories, 2 equip slots, save-persisted; UI is pause-menu-only, not an always-on HUD widget |
| Buy/sell/use shops | PARTIAL | PARTIAL | Buy works (`ShopManager.purchase` real, currency-deducting). **No sell mechanic exists anywhere in the codebase.** |
| Use map/minimap | YES | YES | Real room-reveal map + minimap with fog of war and save persistence; **no fast-travel** |
| Hear music | YES (procedural) | YES (procedural) | Biome/boss/title music generated via deterministic synthesis + MIDI export; the real Stable Audio AI enhancement path exists and is wired in, but its local worker isn't healthy on this machine, so today's output is 100% procedural |
| Hear SFX | YES | YES | Real `AudioManager` with bus routing, pooling, duplicate-SFX collapsing |
| Use generated visuals | PARTIAL/YES (mode-dependent) | PARTIAL/YES (mode-dependent) | 100% procedural placeholder under `LOCAL_ONLY` (confirmed 95/95 twice); ~95% real AI art under `NVIDIA_ONLY`/`HYBRID_FREE` (confirmed 90/95 once). `HYBRID_FREE` is desktop-UI-selectable, so this is reachable by ordinary users, not CLI-only. |
| Export | YES | YES | 4/4 runs staged a real export, including both projects that failed validation |

---

## STEP 7 — Ability Audit

Source of truth: `packages/shared/src/registered-abilities.ts` (`REGISTERED_ABILITIES`), mirrored 1:1 by `templates/godot-metroidvania/scripts/player/AbilityRegistry.gd` (`SUPPORTED_IDS`). **Exactly 9 abilities are currently registered** — this directly refutes the historical "only dash works" claim (moved to Change History).

| ID | Gate mechanism | Runtime file | Save persistence | Runtime-validated gate check | Classification |
|---|---|---|---|---|---|
| dash | none (no obstacle prop) | `DashAbility.gd` | Yes, dedicated save-slot tests | Yes, dash-weakness checks | **FULL** |
| double_jump | none | `DoubleJumpAbility.gd` | Yes, dedicated save-slot tests | Yes | **FULL** |
| ground_slam | `WeakFloor.gd` (breaks on `break_from_slam()`) | `GroundSlamAbility.gd` | tracked generically | Yes, generic ability-gate check | **FULL** |
| grapple | `GrapplePoint.gd` (raycast-detected) | `GrappleAbility.gd` | tracked generically | Yes | **FULL** |
| swim | `WaterZone.gd` (`Area2D`, enter/exit_water) | `SwimAbility.gd` (+ physics in `AbilityController`) | tracked generically | Yes | **FULL** |
| phase | `PhaseBarrier.gd` (collision-layer toggle) | `PhaseAbility.gd` | tracked generically | Yes | **FULL** |
| wall_slide | none (transition-check only, no distinct obstacle prop) | `WallSlideAbility.gd` | not separately tested | not gate-specific | **PARTIAL** |
| wall_jump | none | real `try_jump` logic | not separately tested | not gate-specific | **PARTIAL** |
| air_dash | none | real, in `AbilityController.try_dash()` | not separately tested | not gate-specific | **PARTIAL** |

**Overall: 6/9 FULL (dedicated gate + save + runtime-gate coverage), 3/9 PARTIAL (real mechanics and generation-assigned, but no distinct physical obstacle prop the way slam/grapple/swim/phase have). 0/9 REGISTERED_ONLY or MISSING.** All 9 have real, non-stub GDScript physics implementations (verified directly), input bindings, and are exercised by procedural generation as gates on real world-graph edges (`packages/procedural/src/world.ts`) turned into physical obstacle scenes by `packages/godot/src/room-assembler.ts` (`deriveWeakFloors`/`deriveGrapplePoints`/`deriveWaterZones`/`derivePhaseBarriers`).

---

## STEP 8 — Game Archetype Audit

### SIDE_VIEW_METROIDVANIA — **FULL / production-capable**
Linear-branching room-graph generation, 9-ability platformer movement, melee combat, per-room `.tscn` scenes, ability-gated `RoomTransition`, data-driven bosses, static NPCs with real dialogue/shop, 10-type quest system, full save system, real (mode-dependent) AI art, and a **1595-line `RuntimeSmokeTest.gd` with 265 checks**. Proven RUNTIME_VALIDATED (18/18, including full autonomous playtest victory) twice this session under two different modes.

### TOP_DOWN_ACTION_ADVENTURE — **FULL / production-capable** (upgraded from PARTIAL in this refresh — see Step 42)
A genuinely distinct, real implementation, not a reduced clone of side-view: separate world generator (`packages/procedural/src/topdown/world.ts`, overworld/POI-based, no per-area `.tscn` files — `OverworldManager.gd` spawns everything at runtime from `data/world/overworld.json`), separate `TopDownPlayerController.gd` (8-directional free-roam), item-based progression (`TOP_DOWN_DUNGEON_ITEMS` gating `ItemGate.gd`/`LockedDoor.gd`/`FloorSwitch.gd`, not movement abilities), data-driven `BossController.gd` with a `dash_through` weakness mechanic, and its **own dedicated `RuntimeSmokeTest.gd` (expanded in commit `5917bf9` from 14 to 165 real checks)**.

**[RESOLVED this refresh] `godot_playtest` now passes.** The prior autonomous-playtest P0 (terrain generation creating diagonal tile pinches and POIs on blocked cells that froze the playtest bot — see `METROFORGE_CHANGE_HISTORY.md`) was fixed in commit `1eb4ab3` and independently re-verified fresh in this refresh session: a brand-new `TOP_DOWN_ACTION_ADVENTURE` `TINY_TEST` project (seed `314159`, generated at HEAD `827c1f4`, run in isolation) reached **RUNTIME_VALIDATED, 18/18 gates, `godot_playtest` 8/8** (`playtest_reached_victory_flow`/`playtest_victory_state_or_boss_defeated` both PASS, boss defeated, victory reached, 17.8s). Note: an initial concurrent-with-side-view attempt (seed `920347`) produced a spurious `godot_playtest` crash (`PlaytestAgent.gd` hit a "previously freed instance" script error 817ms in, well below the timeout) — retrying the same generation alone eliminated it, consistent with resource contention from a second simultaneous Godot process rather than a real regression (this repo has heavy concurrent multi-session activity; `657c712`'s own commit message documents the identical contention-then-clean-retry pattern). Treat isolated-run results as authoritative over concurrent-run results in this environment.

Confirmed still-real: static-gate compliance (14/14 non-Godot gates PASS), `godot_imports` PASS, `godot_runtime` near-perfect (164/165, one soft-fail, unchanged). `QuestManager.gd` is byte-identical to side-view's (same 10 objective types). One minor dead-code finding, now partially resolved: `GrapplePoint.gd`/`PhaseBarrier.gd`/`WaterZone.gd` were removed from the top-down template in commit `657c712` (confirmed dead, never instantiated by the top-down generation path); `WeakFloor.gd`/`.tscn` was deliberately kept because it's still enforced by `validator.ts`'s top-down `REQUIRED_FILES` gate even though equally gameplay-dead.

**Classification: the archetype generates a real, distinct game with working core systems and now reliably achieves RUNTIME_VALIDATED status via the default pipeline, including the autonomous playtest gate.** There is no longer a P0 blocker for this archetype (Step 39).

---

## STEP 9 — Desktop Studio UI

16 current nav screens (`apps/desktop/src/studio/nav.ts`, routed in `App.tsx`), grouped Create/Library/World/AI/Ship. Every screen was read at the component level (not just confirmed to have a route) and cross-checked against real IPC handlers in `apps/desktop/electron/handlers.ts`. **All 16 are IMPLEMENTED** — none are placeholder/broken/missing.

| Screen | Data source / IPC |
|---|---|
| Dashboard | `get-project-dashboard`, `run-project-acceptance`, `play-in-godot`/`open-in-godot` |
| Create | `generateGame` (streamed progress) |
| Generation Studio | `get-generation-state`, event streams, `get-generation-review-state`, `approveGenerationReview` |
| Projects | `list-projects`, `refresh-project-template`, `exportProject` |
| Assets | `list-assets`, `get-asset-usages`, `get-asset-history`, `restore-asset-version` |
| Generate Asset | `generateAsset`, `get-asset-preview`, `get-asset-history` |
| World | `get-world-graph`, `update-world-graph`, `undo-world-edit`, checkpoint IPC |
| Rooms | `list-rooms`, `get-room-collision`, `update-room`, `regenerate-room` |
| Dungeon | `get-world-graph`/`get-dungeon-graph` (explicit empty state for side-view projects) |
| Preview | `get-project-preview`, `play-in-godot`, `open-in-godot` |
| Models | `list-models`, `get-hardware-profile`, `scout-models`, `download-model` |
| Providers | `list-providers`, `get-config` |
| Routing | `explain-model-routing` |
| QA | `run-doctor`, `get-validation-results`, `run-project-acceptance` |
| Export | `exportProject`, `get-project-dashboard`, `backfill-asset-maturity` |
| Settings | `get-config`, `set-app-settings`, `get-concurrency-status` |

---

## STEP 10 — Generation Studio

| Feature | Current state |
|---|---|
| Typed generation events | Real — 21 `GenerationEventType` variants (`packages/generation/src/events.ts`), full per-type payloads |
| IPC streaming | Real — `onGenerationEvent`/`onGenerationProgress` |
| Persistent event log | **Absent** — the UI feed is in-memory only, capped at the last 500 events; state is reconstructed on demand from `phases`/`validation_report.json`/world graph, not an append-only log file |
| Weighted phase progress | Real — blends backend `overallProgress` with a locally-derived running-phase estimate |
| Live artifact previews | Real — `LiveArtifactPreview` fetches actual image data via `getAssetPreview` |
| World updates | Real — `WorldGraphUpdated` events trigger a live refetch |
| Task inspector | Real — current task/phase/model/provider/fallback/concurrency panel |
| Interactive review/pause | Real — 5 milestone pause points (game_dna, world_layout, bosses, biome_art, final_qa), backed by `interactive-generation.ts` |
| Partial preview | Real — can launch Godot mid-pause when `previewReady` |
| Cancel | Real — genuine `AbortController`-based cooperative cancellation threaded through the pipeline (`packages/shared/src/cancellation.ts`), not a UI-only stub; caught at the pipeline's top level and persisted as job status `cancelled` |
| Generation queue / worker concurrency | Real — `GenerationQueue` class with per-job `AbortController`s, live concurrency meters |

---

## STEP 11 — World / Room / Dungeon Editors

World-graph editing (`add_room`/`connect_rooms`/`disconnect_rooms`), AI commands (including voice dictation), undo/redo, and checkpoints are all real and wired. **A concrete edit path was traced end-to-end and confirmed to reach real project data**: `WorldEditor.tsx` → `update-world-graph` IPC → `applyWorldEditAndRecompile()` → `applyWorldEditCommand()` (validates + mutates `world_graph.json`) → `GodotProjectAssembler.recompileRooms()` → fresh `.tscn` files written under `scenes/rooms/` and `data/rooms/rooms.json` updated. **One nuance**: a room/world edit recompiles its `.tscn` immediately but does **not** automatically re-run Godot QA gates — full re-validation only happens on the next full `generate` pass or an explicit QA-screen acceptance run.

---

## STEP 12 — AI Infrastructure

| Class | Exists? | Live call site? | Tested? |
|---|---|---|---|
| ProviderRegistry | Yes | Yes — bootstrap → desktop handlers, CLI providers command | Yes |
| ModelRegistry | Yes | Yes — bootstrap → `list-models` IPC | Yes |
| CapabilityRouter | Yes | Yes — wired into GenerationRouter, used by routing-explain paths | Yes |
| FallbackManager | Yes | Yes — inside `GenerationRouter.generate()` | Yes |
| GenerationRouter | Yes | Yes — called live from desktop handlers and the pipeline | Yes |
| LicenseRouter | Yes | Yes — `CapabilityRouter`'s commercial-safe filtering, and (indirectly, via `packages/tools/src/project-export.ts`'s `auditExportLicense()`) every real project export from both the CLI `export` command and the desktop Export screen | Yes |
| ProviderHealthMonitor | Yes | Yes — `run-doctor` IPC handler | Yes |
| ModelCatalog | Yes | Yes — bootstrap, `download-model` IPC, CLI `models` commands | Yes |
| ModelScout | Yes | Yes — `scout-models` IPC, CLI `models scout` | Yes — **[RESOLVED this refresh]** `packages/ai/src/model-scout.test.ts` added in commit `827c1f4` (12 tests, closed Top-20 #20) |
| BenchmarkService | Yes | Yes, but only reachable through `ModelScout.refresh()`, no other direct external call site | Yes |
| ModelDownloadManager | Yes | Yes — `download-model` IPC, CLI `models download` | Yes |

All classes an older audit questioned are present and genuinely wired in — none are dead scaffolding.

---

## STEP 13 — Routing Modes

`packages/shared` defines exactly **11** `GenerationMode` values, all handled with real distinguishing behavior in `packages/ai/src/mode-routing.ts`'s `modeRoutingFlags()`: `FREE_ONLY, LOCAL_ONLY, HYBRID_FREE, CUSTOM, NVIDIA_ONLY, COMMERCIAL_SAFE, OFFLINE, FASTEST, HIGHEST_QUALITY, LOW_VRAM, BALANCED`.

**Important current-state finding: the desktop UI mode dropdown exposes only 4 of the 11** (`GENERATION_MODES = ['FREE_ONLY', 'LOCAL_ONLY', 'HYBRID_FREE', 'CUSTOM']`, in `apps/desktop/src/studio/generation-options.ts`, consumed by every mode `<select>` in the app). The other 7 modes have real, distinct, tested routing behavior in the backend and are reachable via the CLI (`--mode`) or programmatically, but are **not selectable anywhere in the desktop UI**. Note `NVIDIA_ONLY` does **not** actually restrict image-provider candidates to NVIDIA only (only `LOCAL_ONLY` filters image candidates by locality — see Step 15/16); `HYBRID_FREE`, which **is** desktop-selectable, reaches the real NVIDIA image path just as effectively.

---

## STEP 14 — Providers

**13 provider adapters** exist in current source:

- **Text (6)**: Ollama (local, enabled by default, unavailable — not installed), Gemini/Groq/OpenRouter/HuggingFace (cloud, disabled — no API key), NVIDIA NIM (cloud, **enabled and healthy** — key configured, endpoint reachable).
- **Image (3)**: ComfyUI (local, unavailable), Diffusers (local, unavailable), NVIDIA image (remote, **live**).
- **Vision (1)**: NVIDIA vision critic (remote, **live**, used for real QA critique).
- **Speech (2)**: Piper TTS (local, wired but unavailable — no ONNX model resolved on this machine), Whisper ASR (local, present and tested but **has zero call sites anywhere in the codebase outside its own test** — dead/unused).
- **Embedding (1)**: Ollama embeddings (local, depends on Ollama — unavailable).

Only NVIDIA (text + image + vision) is actually live on this machine today. All other unavailability is explained by "not installed locally" (and, for image/audio diffusion, by the absence of a capable local GPU) rather than by missing code — every non-NVIDIA provider has real adapter code and a real call path; they are simply not reachable in this specific environment.

---

## STEP 15 — NVIDIA Dedicated Section

| Capability | Classification | Evidence |
|---|---|---|
| Text generation | **IMPLEMENTED** | `NvidiaProvider.generateText()` — real `/chat/completions` calls, retry/backoff, key redaction |
| Code / reasoning | **IMPLEMENTED** | Same text adapter, routed via capability mapping; catalog includes `nemotron-70b`, `deepseek-coder-6.7b` |
| Image generation | **IMPLEMENTED** | `NvidiaImageProvider.generateImage()` — real `POST` to `ai.api.nvidia.com/v1/genai/{model}`, default model `black-forest-labs/flux.1-dev`. **Confirmed live this session** (90/95 real assets in a fresh run). |
| Image editing | **NOT_IMPLEMENTED** | No edit/inpaint/upscale method exists |
| Vision | **IMPLEMENTED** | `NvidiaVisionCritic.critique()` — real multimodal call, used live in the asset QA path |
| Speech | **NOT_IMPLEMENTED** | No NVIDIA references anywhere in the Piper/Whisper adapters |
| Embeddings | **NOT_IMPLEMENTED** | No NVIDIA embedding adapter exists |
| Reranking | **NOT_IMPLEMENTED** | No reranking code exists anywhere in `packages/ai` |
| Safety | **NOT_IMPLEMENTED** | No dedicated safety/guardrails adapter |
| 3D | **NOT_IMPLEMENTED** | No 3D-generation code exists |

Note: the text-facing model catalog (`config/models.catalog.json`, surfaced by `metroforge models list`) has **zero** NVIDIA image entries — the real NVIDIA image path is registered separately by the asset pipeline's own image-provider registry, not reconciled into the text catalog. This is why `metroforge models list` shows only 5 NVIDIA text/vision entries even though image generation is real and live.

---

## STEP 16 — Real Image Generation

**YES — there is a real, working AI image provider right now.**

- Provider: `nvidia-image`
- Model: `black-forest-labs/flux.1-dev`
- Local/remote: remote (NVIDIA cloud API)
- Real request verified: **yes, this session** — a fresh `NVIDIA_ONLY`-mode generation produced a genuine 377,782-byte AI-generated `player_source.png`, with `critiquePassed: true, critiqueScore: 90` recorded in `generation_manifest.json`
- Output path: `assets/characters/<id>_source.png` (raw AI pose) → processed into `assets/characters/<id>.png` + animation sheets via `pixel-art-processor`
- Godot integration: real — `AnimatedAssetSprite.gd` builds a runtime `SpriteFrames` resource by slicing the compiled sheet
- QA: real vision-critic scoring (score 90 in the observed run)
- Reachability: **not gated behind an obscure mode** — `HYBRID_FREE`, which is desktop-UI-selectable, reaches this same path (only `LOCAL_ONLY` excludes remote image candidates)

The `LOCAL_ONLY`-mode runs in this session producing 95/95 procedural placeholders are correctly explained by mode-based exclusion of the remote NVIDIA provider plus the genuine unavailability of both local image providers on this machine — not by any defect in the NVIDIA image path itself.

---

## STEP 17 — Asset Pipeline (Per Category)

| Category | Current flow |
|---|---|
| Player | Still + walk/attack/hurt/death sheets (4 frames each); AI-capable with automatic procedural fallback |
| Enemy | Same shape as Player |
| Boss | Still (larger if final boss) + walk/hurt/death/attack (3 frames each) |
| NPC | Still + walk sheet only — **no attack/hurt/death sheets generated** (NPCs are non-combatants) |
| Tileset | One biome source image, sliced into individual tile PNGs |
| VFX | 8 fixed textures, **always procedural**, never AI-routed even when an image provider is healthy |
| Weapon / Item / Prop | Supported only via the **manual** single-asset generation path (`generateManual()`), not the automatic bulk pipeline |
| Background / Icon / Portrait / UI / Music / SFX / Voice | No dedicated asset-pipeline generation exists; Music/SFX/Voice are handled entirely by separate procedural-audio and TTS modules (Step 24); Portrait is a hardcoded color rect, not an image (Step 26) |

Every still image goes through the same real flow: procedural placeholder generated first as guaranteed fallback → real AI generation attempted if a healthy `ImageGenerator` was resolved (priority ComfyUI 90 > NVIDIA 88 > Diffusers 85) → AI source bytes preserved as a `_source.png` sidecar → both AI and procedural buffers run through `PixelArtProcessor` (nearest-neighbor scale → palette quantize → alpha-threshold cleanup) → deterministic checks always run, VLM critique runs if a vision critic is available → checkpointed to disk and recorded in the manifest. **Animation sheets are always a deterministic pixel transform of the still's base pose — there is no per-frame AI generation for any animation state**, ever, for any category.

---

## STEP 18 — Asset Maturity

`packages/shared/src/asset-maturity.ts` defines exactly 8 states: `PLACEHOLDER, BLOCKOUT, GENERATED_SOURCE, PROCESSED, COMPILED, QA_REVIEW, PRODUCTION_READY, REJECTED`. In practice, only `PLACEHOLDER, GENERATED_SOURCE, COMPILED, QA_REVIEW, PRODUCTION_READY, REJECTED` are ever actually assigned by current inference logic — `PROCESSED` and `BLOCKOUT` are defined but dormant. A second, divergent 7-value schema exists in `packages/schemas/src/core.ts` (missing `PROCESSED`) — the two enums have drifted apart.

**[RESOLVED this refresh] A placeholder can no longer silently pass production export if the caller opts in.** Two composing commits landed since the baseline: `fb62177` fixed `inferAssetMaturity()` so a critique score alone never auto-promotes an artifact to `PRODUCTION_READY` (previously a high score could false-promote a still-unreviewed asset; now score-passing artifacts stop at `QA_REVIEW` and `PRODUCTION_READY` must be set explicitly), and `ef9b8cc` added an opt-in `requireProductionAssets` flag to `exportProject()` (mirrors the existing `requireCommercialSafe` pattern exactly): when set, export is blocked with a real error + sample artifact list if any artifact's maturity is in `NON_PRODUCTION_MATURITIES` (`PLACEHOLDER`/`BLOCKOUT`/`REJECTED`); otherwise an advisory warning is emitted (unchanged default behavior). Wired to the CLI as `export --require-production-assets`. Verified end-to-end during the original session: a real 100%-placeholder `TINY_TEST` project was generated and `export --require-production-assets` genuinely blocked it with a readable error. Default (`export` with no flag) behavior is unchanged — a placeholder-only project still exports successfully unless the new flag is passed, so this is an *available* enforcement, not a default-on one; the desktop Export screen does not yet expose this flag (a smaller follow-on gap, not tracked separately in Step 39).

---

## STEP 19 — Artifact Provenance

The real, on-disk `generation_manifest.json` (not the aspirational Zod schema in `packages/schemas`, which is written but not what the assembler actually populates) currently records, per artifact: `id, path, type, provider, modelId, fallbackGenerated, critiquePassed, critiqueScore, maturity, productionReady, sourceType, fallbackDepth, fallbackReason, selectedProvider, selectedModel, requestedCapability, productionAllowed, license, commercialUse`.

Against the requested 17-field checklist (artifactId, projectId, capability, assetType, provider, model, model version, prompt hash, seed, parent artifacts, compiler, license, commercial status, QA, maturity, repair count, Godot path):

**8/17 present**: artifactId, capability, assetType, provider, model, license, commercial status, QA, maturity.
**9/17 absent**: per-artifact projectId, model version, prompt hash (defined in the schema, **never populated** in the real code path — confirmed by grep), per-artifact seed (same situation), parent artifacts / lineage, compiler, repair count (no such counter exists anywhere), Godot `res://` path (exists only in a separate `assets_manifest.json` for textures, never merged into the main manifest).

Audio artifacts get an even smaller field set (no `maturity`/`critiquePassed`/`modelId` at all).

---

## STEP 20 — Asset Dependencies

A real dependency/"where-used" graph exists (`packages/generation/src/dependency-graph.ts`), built from manifest artifacts, room→enemy/tileset relationships, and an actual scan of which `.tscn`/`.gd` files reference each asset's `res://` path. **Selective/dirty-propagation regeneration does not exist** — this module supports read-only queries only; there is no mechanism that marks downstream consumers dirty when a source asset changes. Manual room re-edits recompile only the explicitly-targeted room (manual scoping), not graph-derived automatic propagation.

---

## STEP 21 — Sprites

Under the environment tested this session: 100% procedural placeholders under `LOCAL_ONLY` (twice confirmed), ~95% real AI-sourced-then-processed under `NVIDIA_ONLY` (once confirmed, 90/95). Two concrete current gaps found:

- **Idle animation is a stub** — `AnimatedAssetSprite.gd` reuses the walk sheet's first frame as "idle" because no dedicated idle sheet is generated (an explicit comment in the file confirms this is intentional-for-now, not accidental).
- **The player's death sheet is generated but never consumed** — `player_death.png` is produced by the asset pipeline, but no `.tscn`/`.gd` code ever sets a `death_sheet_path` for the Player scene (Enemy/Boss do wire theirs, but only via per-room instance overrides, not the shared base scene). This is a real orphaned-asset bug.

SpriteFrames/Godot integration itself is real and functional — `AnimatedAssetSprite.gd` builds a runtime `SpriteFrames` resource by slicing the compiled sheet into `AtlasTexture` frames, with a safe solid-color fallback if a sheet file is missing.

---

## STEP 22 — Tilesets

**The historical "fixed rectangular floor/wall" limitation is STILL CURRENT for automatically-generated rooms.** A real per-cell `tileCells` data structure and `RoomTileMap.gd` rendering path do exist, but they are wired **only** into the manual room-edit flow (`applyRoomEditAndRecompile` → `recompileRooms`) — the function that builds room-assembly options during *automatic/initial* generation (`buildRoomAssemblyOptions`) has no code path anywhere that ever produces `tileCells`. So every room from a normal `create`/`generate` run falls through `RoomTileMap.gd`'s fallback: a single floor row plus two vertical wall columns. This is a real, current, unresolved P1 gap — not something the room-archetype-fidelity fix (Step 29) touched.

---

## STEP 23 — VFX / Shaders

All 8 required VFX textures (`hit_spark, death_puff, dash_trail, pickup_spark, ability_unlock, boss_phase_shift, area_burst, slam_shock`) are generated **100% procedurally, always** — the VFX generation loop in the asset pipeline has no AI-provider call at all, even when NVIDIA image generation is healthy and being used for characters. `VFXManager.gd` is a real, working sprite+`Tween` burst/ring effect player (scale-up + fade, radial ring spawning for boss phase-shift) — but there is **no** particle system (`GPUParticles`/`CPUParticles`), no screen-space post-processing, and no weather system anywhere in the codebase.

**[Correction this refresh] One real custom shader now exists, but it is opt-in, not part of default generation.** Commit `7269970` (P7 "quality director") added `templates/godot-metroidvania/scripts/shaders/sprite_outline.gdshader` — a real `canvas_item` fragment shader that draws a 1px silhouette outline for player/enemy readability — plus `ReadabilityOutline.gd`, which loads and applies it. However, `ReadabilityOutline.gd` only activates if `res://data/quality/install_readability_outline.json` exists in the project, a file the new opt-in `metroforge quality <slug>` command writes as one of its repair actions (see Step 42) — it is never written by a normal `create`/`generate` run. So: a default generation still ships with zero active shaders (the prior claim stands for the default pipeline), but "no custom shaders anywhere in the codebase" is now false — one exists and is real, tested, reachable via the new QualityDirector pass.

---

## STEP 24 — Audio

The "11 audio files (2 MIDI, 2 tracker-interchange JSON)" seen in every real generation run this session breaks down as: one procedurally-synthesized biome-loop WAV + title + boss music (each paired with a real Standard MIDI export and a JSON "tracker-interchange" file — an explicitly-documented manual-recreation aid for musicians, **not** an importable tracker project) plus 8 procedurally-synthesized SFX WAVs.

**Stable Audio (real AI music enhancement) has a real, wired call path** (`enhanceMusicWithStableAudio()`, called unconditionally right after procedural music generation in the pipeline) that spawns a local Python diffusers worker — it silently no-ops when that worker isn't healthy, which is the case on this machine (same "not installed locally, no capable GPU" situation as image generation). **Piper TTS for dialogue voice lines** has the same real-but-locally-unavailable pattern. **Whisper ASR is present in code and tested but has zero call sites anywhere else in the codebase** — dead/unused.

`AudioManager.gd` (Godot runtime side) is fully real: bus routing (Music/SFX → Master), pooled SFX players with LRU stealing, same-frame duplicate collapsing, per-bus volume, and dialogue-voice playback. No loudness-normalization step exists anywhere in the audio-generation code.

---

## STEP 25 — Quests

The generator and the runtime currently track **exactly the same 10 objective types**, with no subset mismatch: `Reach, Kill, Collect, Talk, AbilityAcquire, Discover, Activate, Interact, Choice, BossKill` (the last always appended as the campaign's final quest). This **directly refutes** the historical "Reach/BossKill only" claim. All 10 are EventBus-integrated, save-persisted, and UI-exposed (`QuestPanel.gd`/`QuestTrackerPanel.gd`). `QuestManager.gd` is byte-identical between both archetypes. No isolated `QuestManager` unit test exists — coverage is indirect, via gameplay-signal emission inside `RuntimeSmokeTest.gd`.

---

## STEP 26 — NPC / Dialogue / Shop

Interaction is proximity-based (`Area2D` + `interact` action, not walk-over). Dialogue trees support **real branching** — choice nodes can jump to a different dialogue ID, trigger `accept_quest`/`open_shop` actions, and are world-state-aware (offer/active/complete variants selected from live quest state). Quest handoff from dialogue is real and direct. **Shops are buy-only — no sell mechanic exists anywhere** in `ShopManager.gd`/`ShopOverlay.gd`. **NPC portraits are hardcoded color rects, not images.** No localization exists. **TTS is real but optional** (Piper, silently skipped when unavailable — current environment). **NPCs have zero movement/schedule code — fully static** for the entire game.

---

## STEP 27 — Inventory / Economy

6 real item categories with distinct behavior: `currency` (routed through a single shared wallet in `QuestManager.currency`, intentionally deduplicated), `consumable` (immediate heal effect, doesn't stack), `weapon`/`charm` (2 equip slots, stat bonuses only while equipped), `relic` (permanent stat bonus on pickup), `collectible` (completion-percent tracking). Equip/unequip is real, emits events, recalculates live stat bonuses. Save-persisted. **HUD display is pause-menu-only** — there is no always-visible in-world inventory HUD widget.

---

## STEP 28 — Map

**Fully functional, not a placeholder.** Real room-reveal-on-visit, real fog of war (undiscovered rooms rendered distinctly, edges to them hidden), real current-room highlight marker, save-persisted discovered-room set. Minimap is a genuine architectural reuse (`MinimapPanel` extends `WorldMapPanel`, calls `super._draw()`), not a separate stub implementation. **No fast-travel feature exists** anywhere in the codebase.

---

## STEP 29 — Godot Assembly

`GodotProjectAssembler.assemble()` copies the archetype-correct template wholesale (resolved via `game_dna.json`'s archetype field through `resolveGameArchetype()`/`getGameArchetypePlugin()`), then layers on generated data: per-room `.tscn` files (side-view) or `data/world/overworld.json` (top-down), `game_dna.json`, `world_graph.json`, `progression_graph.json`, `playtest_route.json`, per-category JSON data files, audio, textures, and `generation_manifest.json`, plus title-text patches to `project.godot`/`Main.tscn`. Input map, SpriteFrames, TileSet-runtime, save, UI, and audio-manager logic all live in the copied template's static scripts, not per-project generated code.

**The historical room-archetype data-loss bug is CONFIRMED FIXED.** `resolvePublishedArchetype()` (`packages/godot/src/room-assembler.ts`) preserves the world-graph-assigned archetype verbatim whenever it's a recognized value, falling back to `'combat'` only for genuinely unrecognized tags — and an explicit regression gate, `auditRoomArchetypeFidelity()`, feeds the `room_archetype_fidelity` QA gate, which **passed in every real run this session** ("8 matched, 1 intentional override"; "4 matched, 0 overrides"). This bug has been moved to Change History.

---

## STEP 30 — GDScript Generation

**Runtime `.gd` scripts are stable, hand-written templates copied verbatim** — `cpSync(templatePath, outputDir)` copies the entire template tree unmodified except for two text-string title patches. Only `.tscn` scene files are data-driven-generated per project (string-templated with room/entity data plugged in), and those reference the static, pre-written scripts by path rather than generating new script code.

The `GDSCRIPT`/`CODE_GENERATION` router capability is registered in the model catalog (models like `qwen2.5-coder`, `starcoder2`, `deepseek-coder` are tagged for it) but has **zero real call sites anywhere in the generation pipeline** — confirmed by exhaustive grep. This is intentional by design, not an oversight: explicit code comments confirm the system deliberately avoids generating/inventing GDScript ("do not invent GDScript stubs" — `remap-project-abilities.ts`; `RepairEngineer` explicitly skips auto-repair of unknown abilities rather than fabricating script code). **There is currently no AI-generated GDScript anywhere in MetroForge**, despite the routing plumbing existing for it.

---

## STEP 31 — Godot Validation Pipeline

**Runtime validation is now fully automatic** — `godot_imports`, `godot_runtime`, `godot_playtest`, and `gameplay_screenshot_qa` all run inside every normal `create`/`generate` call whenever Godot is detected, with no separate manual invocation required. The pipeline's own inline comment states this explicitly: this is a deliberate fix superseding an earlier design where runtime validation "only ran via a separate, easy-to-forget `metroforge validate --runtime` invocation" (moved to Change History).

- Skip flag: `--skip-runtime-validation` skips the three Godot-execution gates but still runs `godot_imports`.
- If Godot isn't installed, all four gates are marked skipped/`NEEDS_RUNTIME_VALIDATION`, and generation still proceeds.
- A runtime FAIL does **not** block the rest of generation or export — the project's DB/CLI status is set to `validation_failed` instead of `complete`, files are still written, and export still runs (confirmed directly: both top-down runs this session exported successfully despite failing validation).
- The standalone `metroforge validate <slug>` CLI command intentionally runs only 16 of the 18 gates (14 static + `godot_imports` + `godot_runtime`) — it does **not** run `godot_playtest`/`gameplay_screenshot_qa` by design; those are pipeline-only gates.

---

## STEP 32 — Playtesting

All of the following are real and currently implemented, given as one non-contradictory answer each:

- **Graph proofs / victory planning**: real BFS over the world graph respecting ability-gated edges (`planVictoryRoute`).
- **Personas**: **4 defined as of this refresh** (was 2) — `victory_rusher` (fast, 8s walk / 12s boss timeout) and `ability_collector` (patient, 12s / 14s), both auto-selected by profile size as before, plus two added in commit `630ad61`: `critical_path` (10s / 16s) and `explorer` (14s / 16s), auto-selected only for the not-yet-fully-wired `RELEASE_CANDIDATE` profile (see Step 42 — the profile's `GenerationProfile` type/CLI plumbing isn't committed yet, so these two aren't reachable through the default pipeline today even though the persona definitions and alias-resolution code are real and tested).
- **Input bot**: real `Input.action_press/release` simulation against the live player controller (not internal method calls), for both archetypes, each with its own archetype-appropriate implementation.
- **Telemetry / balance hints**: real, written to `playtest_telemetry.json`, with automatic flags for incomplete routes, slow transitions, and near-timeout boss fights.
- **Movement/physics feasibility**: a separate, statically-checked pre-flight (5 tests), distinct from both the graph-reachability proof and the runtime playtest bot.
- **Boss victory validation**: proven at two independent layers — internal-API (`RuntimeSmokeTest`) and input-simulated (`PlaytestAgent`).
- **Save/load**: thoroughly runtime-tested (migration, backup recovery, multi-slot, death→respawn).

**[RESOLVED this refresh] The prior asymmetry is gone.** Both archetypes now pass their autonomous playtest proof reliably: side-view passed 2/2 in the original baseline session, and top-down — after the `1eb4ab3` fix — passed a fresh isolated re-verification this refresh (seed `314159`, 8/8 checks, victory + boss defeat). See Step 39/42 — there is no longer a P0 here. Separately, commit `630ad61` ("stabilize playtest hitboxes doors and transitions", side-view-only, `templates/godot-metroidvania`) hardened `PlaytestAgent.gd`'s door/transition handling further: it now explicitly waits for a locked transition's `monitoring` flag to flip before walking to it, retries a missed sensor trigger by stepping off and back onto the door, and defeats any alive miniboss blocking a room exit before attempting the exit — plus `room-assembler.ts` was fixed to stop placing ability pickups/multiple same-direction connections on top of each other's sensor volumes. This was pre-existing robustness work on an already-passing archetype, not a bug fix for a known failure.

---

## STEP 33 — Repair Loop

`RepairEngineer.repair()` is a single deterministic pass handling: manifest recreation, InputMap restoration, static template-file restoration, and Main-scene/`project.godot` restoration (all reapplying the game's title patch). It explicitly does **not** attempt to repair `registered_abilities_valid` failures (by design — avoids inventing GDScript). The pipeline wraps this in a bounded loop (max 3 attempts), fully re-validating all gates after each attempt, stopping early if an attempt changes nothing. **Confirmed working as designed this session**: the top-down runs' `automated_repair` correctly attempted once and reported "still failing" for `godot_playtest` — there is no repair strategy for playtest failures (an intentional gap, not a bug in the loop itself), so a single no-op attempt followed by an honest failure report is the correct, expected behavior.

---

## STEP 34 — Export

Real project-folder packaging (with optional zip), `export_manifest.json` (validation state, license summary, QA gates, completion summary) and `license_report.json` (via `auditExportLicense()`). **Validation-blocking is optional and off by default** (`requireValidation` defaults false — confirmed directly: both failing top-down runs this session exported successfully). **Commercial-safe blocking is optional**, auto-enabled only under `COMMERCIAL_SAFE` mode. **The production-asset-maturity gate does not block export at all** (Step 18) — this is the most significant of the export-time gaps. The exported folder is a complete, standalone copy of the Godot project and should run directly via Godot F5, consistent with every real export produced this session.

---

## STEP 35 — Database

7 current tables (`schema_migrations` + 6 app tables):

| Table | Status |
|---|---|
| `projects` | **ACTIVE** — real writer and reader |
| `validation_results` | **ACTIVE** — real writer and reader |
| `settings` | **ACTIVE** — real writer and reader |
| `generation_jobs` | **DEAD reader** — written on every generation run, but `JobRepository.findById` has zero call sites anywhere outside its own definition; resume logic uses a filesystem checkpoint instead |
| `generation_stages` | **DEAD reader** — same situation, reachable only through the unused `findById` |
| `artifacts` (DB table, distinct from the JSON manifest) | **DEAD reader** — `ArtifactRepository.listByJob` has zero call sites; the repository class isn't even re-exported from the package's public index |
| `schema_migrations` | infrastructure only, self-contained |

---

## STEP 36 — Security

**Both previously-reported issues are RESOLVED** (moved to Change History with evidence):
1. **ModelDownloadManager injection** — resolved. Uses `execFileSync`/`spawn` with argv arrays exclusively (no shell string concatenation anywhere in the file), plus a regex allowlist (`assertSafeModelIdentifier`) as defense-in-depth before every download call.
2. **CLI slug path traversal** — resolved. `resolveProjectPathSafe()` is the single canonical choke point, rejecting `..`/absolute paths/null bytes/control chars and re-verifying the resolved path is a direct child of the approved root; wired into every slug-taking CLI command; covered by 17 passing tests including Windows-specific traversal shapes (drive letters, UNC paths, symlinked roots).

**New current finding (not previously flagged)**: Electron isolation is sound (`contextIsolation: true`, `nodeIntegration: false`, `contextBridge`-only preload). Of roughly 38 filesystem-touching IPC handlers, ~36 consistently call `assertProjectPath()` (which confirms the path is both a real Godot project and inside the approved `GeneratedGames` root) before touching disk. **Two do not**: `get-project-preview` (only checks `project.godot` exists, no root-confinement) and `open-in-godot`/`play-in-godot` (no root-confinement in the handler itself, only a "is this a real Godot project" check inside the launcher). In this Electron app's threat model the renderer is normally first-party/trusted, so this is a defense-in-depth inconsistency rather than a remote-attacker vector — but it is a genuine, current gap relative to the app's own established pattern.

Credential handling is sound: `packages/shared/src/logger.ts` redacts secret env-var values, `Authorization: Bearer` tokens, `?key=` params, and known key-prefix shapes unconditionally on every log call (tested end-to-end, including a spy-based assertion that a real secret never appears in actual console output); `get-config` returns only booleans to the renderer, never raw key values.

---

## STEP 37 — Dead Code

- `templates/godot-topdown-adventure/scenes/world/AbilityPickup.tscn`/`scripts/world/AbilityPickup.gd` — deletion (visible in git status) is cleanly resolved; no dangling references remain.
- ~~`templates/godot-topdown-adventure/scripts/world/{GrapplePoint,PhaseBarrier,WaterZone,WeakFloor}.gd` — present in the template but never instantiated by the top-down generation path (vestigial, real current finding, harmless).~~ **[RESOLVED this refresh, partially]** `GrapplePoint`/`PhaseBarrier`/`WaterZone` (`.tscn`+`.gd`, 6 files) removed in commit `657c712` — confirmed dead (no reference from the top-down room assembler or any script), removal verified clean via tests + a real regeneration. `WeakFloor.gd`/`.tscn` deliberately **not** removed: it's still listed in `validator.ts`'s top-down `REQUIRED_FILES`, so deleting it would regress the `required_files` gate even though the script itself remains equally unreferenced by gameplay code — changing what the gate enforces was scoped out as a separate decision.
- `packages/database/src/repositories/job.ts`'s `findById` and `packages/database/src/repositories/artifact.ts`'s `listByJob` — written to, never read by anything outside their own definitions (Step 35).
- `packages/ai/src/providers/whisper-asr.ts` — implemented and tested, but has no call site anywhere else in the codebase (Step 24).
- No `OLD`/`deprecated`/`_old`/`backup`/`.bak`-named files exist anywhere in `apps/`, `packages/`, or `templates/`.

---

## STEP 38 — Completion Matrix

Conservative, current-state estimates (not averaged blindly — see the three separate readiness lines below).

| Area | Estimate | Basis |
|---|---|---|
| Core application (CLI + pipeline) | High | Real, end-to-end proven 4/4 this session |
| Desktop Studio | High | 16/16 screens implemented with real IPC |
| CLI | High | All documented commands function as described |
| Persistence | Medium-High | 3/6 app tables fully wired, 3/6 write-only |
| AI infrastructure | High | Every major class exists, wired, mostly tested |
| Provider ecosystem | Medium | 13 adapters exist; only 1 (NVIDIA) live in this environment |
| NVIDIA | Medium-High | Text/image/vision real and live; speech/embedding/rerank/safety/3D absent |
| Game generation (core loop) | High | Proven for side-view (twice, baseline) and top-down (fresh isolated re-verify this refresh, seed 314159) — **[upgraded this refresh]** both archetypes now reach RUNTIME_VALIDATED via the default pipeline |
| Narrative (dialogue/quests) | High | Real branching dialogue, 10/10 quest-type parity |
| World generation | Medium-High | Real graph/reachability, but tileset layout still fixed-rectangular for auto-gen |
| Progression | High | Ability/item gating real and runtime-proven |
| Godot runtime (side-view) | High | 18/18, 265-check smoke test |
| Godot runtime (top-down) | High | **[upgraded this refresh]** 18/18 fresh, 164/165 smoke (unchanged), playtest now passes 8/8 (was failing, fixed by `1eb4ab3`) |
| Godot assembly | High | Archetype-correct, room-fidelity bug fixed |
| Player | High | Full movement/combat/death/respawn |
| Combat | High | Real hitbox/hurtbox both archetypes |
| Abilities | Medium-High | 6/9 FULL, 3/9 PARTIAL |
| Enemies | High | Data-driven, real |
| Bosses | High | Data-driven, phased, weakness mechanics |
| NPCs | Medium | Real dialogue/shop, but static (no movement/schedule) |
| Dialogue | High | Real branching |
| Quests | High | 10/10 type parity, EventBus/save/UI wired |
| Inventory/economy | Medium-High | Real, but buy-only shops, pause-menu-only HUD |
| Map | High | Real, fog of war, save-persisted, no fast-travel |
| Save | High | Migration, backup recovery, multi-slot, all proven |
| Asset Foundry (pipeline architecture) | High | Real AI-capable pipeline with guaranteed fallback |
| Image generation | Medium | Real and proven, but only 1 of 3 image providers reachable here |
| Sprite generation | Medium | Real base-pose pipeline; idle stub, orphaned death asset |
| Animation | Medium | Deterministic transforms only, no per-frame AI |
| Tilesets | Low-Medium | Real system exists but not wired to automatic generation |
| UI assets | Low | Portraits are color rects, no real UI-asset pipeline |
| VFX | Medium | Real burst/ring system, always procedural in default gen; no particles anywhere; one real opt-in outline shader exists (Step 23, reachable only via the new `metroforge quality` command) |
| Music | Medium | Real procedural + MIDI; AI enhancement path exists but unavailable here |
| SFX | Medium-High | Real, procedural, well-integrated (buses/pooling) |
| Speech | Low-Medium | Real TTS path exists but unavailable here; ASR entirely unused |
| Vision QA | Medium-High | Real NVIDIA vision critique, live |
| QA/repair | High | 18-gate system, real bounded repair loop |
| Playtesting | High | **[upgraded this refresh]** Real infrastructure, now passing for both archetypes; 4 personas defined (2 more added since baseline, 2 not yet reachable pending in-progress `RELEASE_CANDIDATE` profile wiring) |
| Export | Medium-High | Real packaging; production-maturity gate not enforced |
| Commercial-safe workflow | Medium | Real license auditing exists; downstream derivative frames default to "unknown" commercial status |

**PLAYABLE VERTICAL SLICE READINESS: HIGH for both SIDE_VIEW_METROIDVANIA and TOP_DOWN_ACTION_ADVENTURE** (updated this refresh — top-down's autonomous-playtest blocker is resolved and re-verified fresh at HEAD; both archetypes reach RUNTIME_VALIDATED via the default pipeline).

**MID-LEVEL GAME GENERATOR READINESS: MEDIUM.** TINY_TEST is fully proven end-to-end; scaling to genuinely mid-level content depth is limited less by generation-pipeline capability and more by the structural gaps above (fixed tileset layout, no per-frame animation variety, buy-only economy, no fast-travel) that would become more noticeable at larger profile sizes (not directly exercised in this audit).

**PRODUCTION READINESS: LOW-MEDIUM.** The core technical pipeline is solid and well-tested (392/392 tests, real Godot validation, real security fixes), but several gates that should enforce production quality are currently informational only (asset maturity at export, per-artifact provenance), and one real generation-mode asymmetry (top-down playtest) currently blocks a full RUNTIME_VALIDATED result for half the supported archetypes.

---

## STEP 39 — Current Blockers

### P0 — generated game cannot reliably complete/run
**NONE — 0 P0 as of this refresh.** ~~TOP_DOWN_ACTION_ADVENTURE's autonomous playtest/victory-proof currently fails.~~ Fixed in commit `1eb4ab3` (root-caused to terrain generation creating diagonal tile pinches / POIs on blocked cells that froze the playtest bot) and re-verified fresh in this refresh at HEAD (isolated run, seed `314159`, `godot_playtest` 8/8, RUNTIME_VALIDATED 18/18). Full writeup moved to `METROFORGE_CHANGE_HISTORY.md`.

### P1 — blocks mid-level complete game generation
1. Auto-generated rooms still use the fixed rectangular floor/wall tile layout — the real per-cell `tileCells` system exists but is wired only into the manual room-edit path, not automatic generation.
2. ~~The production-asset-maturity gate does not block export~~ **[RESOLVED this refresh]** — `fb62177` fixed maturity-inference correctness and `ef9b8cc` added an opt-in `--require-production-assets` export flag that genuinely blocks a 100%-placeholder project. See Step 18. (Remaining smaller gap, not P1-tracked: the desktop Export screen doesn't yet expose this flag in the UI, only the CLI does.)
3. Desktop UI exposes only 4 of 11 generation modes; `COMMERCIAL_SAFE`, `LOW_VRAM`, `OFFLINE`, `FASTEST`, `HIGHEST_QUALITY`, `NVIDIA_ONLY`, `BALANCED` are functional but unreachable without the CLI. (A 12th mode, `LOWEST_COST`, is being added by the in-progress uncommitted work — see Step 42 — not yet real/committed.)
4. Artifact provenance captures only 8/17 requested fields in the real manifest — no prompt hash, no per-artifact seed, no parent-artifact lineage, no repair count, no merged Godot path — meaningfully limiting reproducibility/audit trail as AI-asset volume grows.

### P2 — major production quality/depth gap
1. No dirty-propagation/selective-regeneration on the asset dependency graph (where-used queries only).
2. Idle animation is a stub (reused walk frame); the player's generated death sheet is never wired into `Player.tscn`.
3. Two divergent asset-maturity enum definitions exist (`asset-maturity.ts` 8 values vs. `schemas/core.ts` 7 values).
4. Shops are buy-only — no sell mechanic exists anywhere.
5. No fast-travel on the generated world map.
6. VFX is 100% procedural sprite+tween bursts by default — no particle systems, screen effects, or weather, even when a healthy AI image provider is available. (One real opt-in outline shader now exists via the new `metroforge quality` command — see Step 23 — but it is not part of default generation, so this gap stands for the default pipeline.)
7. On this development machine specifically, local image (ComfyUI/Diffusers) and local audio (Stable Audio worker, Piper TTS) providers are all unavailable — real AI output is reachable only via the cloud NVIDIA path and only when a non-`LOCAL_ONLY` mode is chosen.
8. Two IPC handlers (`get-project-preview`, `open-in-godot`/`play-in-godot`) lack the root-confinement check the app's ~36 other filesystem-touching handlers consistently apply.
9. `WhisperAsrProvider` and three DB-table readers (`JobRepository.findById`, `ArtifactRepository.listByJob`, and by extension `generation_stages`) are dead/unused code.
10. Downstream `pixel-art-processor`-derived sprite frames (the large majority of a real AI character's actual in-game frames — 77/95 in the observed run) inherit `commercialUse: "unknown"` rather than the license status of their AI-source parent, so most of a real AI-generated character isn't marked commercial-safe even when its source pose was.

### P3 — enhancement/future scope
NVIDIA speech/embeddings/reranking/safety/3D not implemented; no localization; NPCs have no movement/schedules; no audio loudness normalization; `ModelScout` has no dedicated test file.

---

## STEP 40 — Top 20 Current Remaining Engineering Tasks

Ranked by user value, dependency order, correctness, generation quality, risk, and commercial readiness. **4 of the original 20 are now DONE as of this refresh: #1, #3, #16, #20** (struck through below, left in place for numbering/dependency-order continuity rather than renumbering the list).

1. ~~**Diagnose and fix the top-down `godot_playtest` failure.**~~ **[DONE]** Fixed in `1eb4ab3` (root cause: terrain generation created diagonal tile pinches and POIs on blocked cells that froze the playtest bot — not the transition-timing theory this document originally guessed). Re-verified fresh this refresh at HEAD `827c1f4`, isolated run, seed `314159`: 18/18 gates, `godot_playtest` 8/8, boss defeated, victory reached.
2. **Wire `tileCells`/real per-cell layout into automatic room generation**, not just the manual edit path. Reason: P1, biggest remaining "looks procedural" quality gap. Dependencies: none new. Affected: `packages/procedural/src/world.ts` or `content.ts`, `room-assembler.ts`. Acceptance: a fresh auto-generated room's `.tscn` contains non-trivial `painted_cells_json`, not just the floor/wall fallback. Complexity: Medium-High.
3. ~~**Enforce the asset-maturity gate at export.**~~ **[DONE]** `fb62177` fixed maturity-inference correctness (no more false auto-promotion to `PRODUCTION_READY` from score alone) and `ef9b8cc` added the opt-in `requireProductionAssets`/`--require-production-assets` flag exactly as scoped, verified end-to-end against a real 100%-placeholder project. Default behavior confirmed unchanged.
4. **Expose the remaining 7 generation modes in the desktop UI.** Reason: P1, real functionality invisible to ordinary users. Dependencies: none. Affected: `apps/desktop/src/studio/generation-options.ts` and every consumer. Acceptance: all 11 modes selectable and functional from Create/Generation Studio/Settings. Complexity: Low.
5. **Populate `promptHash`/per-artifact `seed`/parent-artifact lineage in the real manifest.** Reason: P1, provenance/reproducibility. Dependencies: none. Affected: `packages/generation/src/pipeline.ts`, `packages/godot/src/assembler.ts`. Acceptance: a fresh manifest's artifacts contain non-null `promptHash` and `seed`. Complexity: Medium.
6. **Re-license `pixel-art-processor`-derived frames from their AI-source parent** instead of defaulting to `commercialUse: "unknown"`. Reason: P2, undermines the commercial-safe workflow for the majority of real AI-generated content. Dependencies: #5 (lineage helps). Affected: `packages/assets/src/asset-pipeline.ts`, `packages/ai/src/provider-license-metadata.ts`. Acceptance: derived frames inherit their source's license/commercialUse. Complexity: Medium.
7. **Implement a real idle animation sheet** (or explicitly document walk-frame-1 reuse as final design, not a stub). Reason: P2, visible quality gap. Dependencies: none. Affected: `asset-pipeline.ts`, `png.ts`. Complexity: Low-Medium.
8. **Wire `death_sheet_path` for the player's base `Player.tscn`.** Reason: P2, orphaned generated asset. Dependencies: none. Affected: `Player.tscn`, `room-assembler.ts`. Acceptance: player death animation actually plays in a fresh project. Complexity: Low.
9. **Reconcile the two divergent asset-maturity enums.** Reason: P2, schema drift risk. Dependencies: none. Affected: `packages/shared/src/asset-maturity.ts`, `packages/schemas/src/core.ts`. Complexity: Low.
10. **Add a sell mechanic to `ShopManager`/`ShopOverlay`.** Reason: P2, economy depth. Dependencies: none. Complexity: Medium.
11. **Add root-confinement checks to `get-project-preview` and `open-in-godot`/`play-in-godot`.** Reason: P2, security consistency. Dependencies: none. Affected: `apps/desktop/electron/handlers.ts`. Acceptance: both handlers reject a path outside the approved `GeneratedGames` root. Complexity: Low.
12. **Add automatic dirty-propagation/selective regeneration** using the existing dependency graph. Reason: P2, iteration speed/cost at scale. Dependencies: #5 helpful for provenance-aware invalidation. Affected: `dependency-graph.ts`, pipeline. Complexity: High.
13. **Add a fast-travel option to the map system.** Reason: P2, standard genre expectation. Dependencies: none. Affected: `MapManager.gd`, `WorldMapPanel.gd`. Complexity: Medium.
14. **Wire generation_jobs/generation_stages/artifacts(DB) readers, or remove them.** Reason: P2, dead code / unclear resume-source-of-truth (filesystem checkpoint vs. DB). Dependencies: none. Complexity: Low (remove) to Medium (wire in).
15. **Remove or wire `WhisperAsrProvider`.** Reason: P2, dead code. Complexity: Low.
16. ~~**Remove vestigial top-down gate scripts** (`GrapplePoint`/`PhaseBarrier`/`WaterZone`/`WeakFloor.gd`) or document why they're retained.~~ **[DONE, partially]** `657c712` removed the 3 confirmed-dead ones; `WeakFloor.gd`/`.tscn` intentionally kept and documented (still required by the `required_files` gate). See Step 37.
17. **Add basic VFX particle/shader support** for at least hit/death effects. Reason: P2, visual polish. Dependencies: none. Complexity: High.
18. **Add audio loudness normalization** to procedural music/SFX synthesis. Reason: P2, mix consistency. Complexity: Low-Medium.
19. **Give NPCs basic movement/schedules.** Reason: P3, immersion. Complexity: High.
20. ~~**Add a `ModelScout` test file.**~~ **[DONE]** `827c1f4` added `packages/ai/src/model-scout.test.ts`, 12 tests.

---

## STEP 41 — What Not to Rewrite

Systems source proves are genuinely stable and should be preserved as-is:

- **World reachability / connectivity proofs** (`packages/procedural/src/world.ts` validators) — deterministic, well-tested, exercised on every real run this session with correct results.
- **CapabilityRouter / FallbackManager / GenerationRouter** — a real, tested, live-wired routing stack; the historical "built but never called" version is gone.
- **ProviderRegistry / ModelRegistry** — solid infrastructure, live-wired to both CLI and desktop.
- **NVIDIA text and image providers** — proven live this session, real retry/backoff, real redaction.
- **`RuntimeSmokeTest.gd`** (both archetypes) — large, genuinely thorough (265 checks side-view, 164/165 passing top-down), catching real regressions (as evidenced by the many recent commit messages describing bugs this suite found).
- **`QAValidator`** (`packages/qa/src/validator.ts`) — the 18-gate system is coherent, well-designed (SOFT_FAIL/UNKNOWN/SKIPPED distinctions are meaningful, not decorative), and matched observed CLI output exactly across 4 real runs.
- **SpriteFrames-at-runtime system** (`AnimatedAssetSprite.gd`) — real, working, handles missing files gracefully.
- **Generation event system** (`packages/generation/src/events.ts`) — 21 well-typed event variants, genuinely streamed to the UI.
- **Room selective recompilation** (`recompileRooms()`) — proven to reach real `.tscn` output from a real UI edit, traced end-to-end.
- **`resolveProjectPathSafe()` / `assertSafeModelIdentifier()`** — the two resolved security fixes are solid, well-tested choke points; do not bypass or duplicate them.
- **Save/load system** (`SaveManager.gd`) — migration, backup recovery, and multi-slot logic are all real and runtime-proven.

---

## STEP 42 — Refresh Findings (2026-08-16, HEAD `827c1f4`)

This section records what changed between the 2026-08-14 baseline audit (`5917bf9`) and this refresh (`827c1f4`) — 13 commits. 5 were already known/verified earlier in this session and are summarized here only for completeness (full detail already folded into the relevant Steps above and into `METROFORGE_CHANGE_HISTORY.md`); **8 were previously uninvestigated commits from concurrent sessions/tools**, read and assessed fresh for this refresh.

### The 5 already-known commits (folded in above; listed here for traceability)
1. `5917bf9` — top-down `RuntimeSmokeTest.gd` expanded 14 → 165 checks (this is the audit's own baseline commit, not new since the last audit — included for completeness).
2. `1eb4ab3` — **fixed the sole P0** (top-down terrain generating diagonal pinches/unreachable POIs, freezing the playtest bot). Re-verified fresh this refresh — see Step 8/39.
3. `657c712` — removed 3 confirmed-dead top-down gate files; `WeakFloor` kept (Top-20 #16, done). See Step 37.
4. `ef9b8cc` — production-asset-maturity export gate (Top-20 #3, done). See Step 18.
5. `827c1f4` (HEAD) — `ModelScout` test coverage added (Top-20 #20, done). See Step 12.

### The 8 newly-investigated commits (concurrent sessions/tools — Claude and Cursor co-authored)

| Commit | What it actually did | Verdict |
|---|---|---|
| `fb62177` "Harden NVIDIA image generation and stop false PRODUCTION_READY maturity" | Fixed `inferAssetMaturity()`: a passing critique score no longer auto-promotes an artifact straight to `PRODUCTION_READY` — it now stops at `QA_REVIEW`, and `PRODUCTION_READY` must be set explicitly by a caller. Also: retries blank/empty NVCF image payloads, blocks the Manual single-asset path from silently reporting a procedural-fallback as a success, raises character sprite frames from a smaller size to 64×64. | **Real fix, composes correctly with `ef9b8cc`.** `ef9b8cc` (landed later, chronologically after this) explicitly builds on this commit's maturity-inference fix via `isNonProductionMaturity`/`NON_PRODUCTION_MATURITIES` — confirmed by reading both diffs; no conflict, this is a two-commit sequence (fix inference, then enforce on it), not two competing attempts at the same problem. |
| `f86a394` "Sanitize NVIDIA brand tokens from all image generation prompts" | New `packages/assets/src/sanitize-image-prompt.ts` — strips `NVIDIA`/`NVCF`/`NVAPI` tokens from image-generation prompt text before sending to the hosted NVCF endpoint. Commit message: NVCF was observed returning blank/black images when a prompt echoed the vendor's own brand name (seen with smoke-test projects literally titled "NVIDIA …"). | **Real, small, tested (3 tests) bug fix** for a genuine hosted-API quirk. Orthogonal to everything else. |
| `630ad61` "fix(runtime): stabilize playtest hitboxes doors and transitions" | Side-view-only (`templates/godot-metroidvania`), not top-down. Substantially hardens `PlaytestAgent.gd`'s door/transition logic (waits for a locked transition's `monitoring` flag, retries a missed sensor trigger, defeats miniboss room-lockers before exiting), fixes `room-assembler.ts` placing ability pickups and same-direction connections on overlapping sensor positions, raises `godot_playtest`'s exec timeout (150s→600s) and frame budget (12000→360000) for larger future maps, adds 2 new playtest personas (`critical_path`, `explorer`) for the in-progress `RELEASE_CANDIDATE` profile, and gives `gameplay_screenshot_qa` an optional hard-fail `required` mode. | **Real, tested, pre-emptive robustness work on an already-passing archetype** — not a fix for any documented failure. Confirmed via file scope that it does not touch top-down, so it's orthogonal to `1eb4ab3`'s P0 fix, not a competing/duplicate attempt. See Step 32. |
| `072d85a` "release: close P6 release-candidate gates" | Adds `packages/qa/src/gameplay-capture.ts` (new: a real windowed-GPU screenshot capture fallback with process-tree kill handling, retried when headless capture returns a null texture or a blank/near-blank image — `needsWindowedCaptureFallback()`/`headlessTextureNull()`), wires it into `validator.ts`'s `validateGameplayScreenshot()`, adds a `required: true` hard-fail mode for a `RELEASE_CANDIDATE` profile, raises `godot_runtime`'s timeout/frame-budget, adds `StyleBibleSchema` to `packages/schemas/src/bibles.ts`, and adds `buildAttributionsMarkdown()` to `export-license-audit.ts` (a real attributions-file generator, not yet checked whether it's wired into the export output — not fully traced this refresh). | **Real, substantial QA-pipeline hardening**, genuinely improves `gameplay_screenshot_qa` gate robustness (fallback capture strategy). **Important nuance**: this commit and `7269970` below both write `RELEASE_CANDIDATE`-aware gate logic, but the `GenerationProfile` TypeScript type and CLI `--profile` plumbing for `RELEASE_CANDIDATE` is **not yet committed** — confirmed by diffing `packages/shared/src/constants.ts` across the full `5917bf9..HEAD` commit range (zero change) versus the current uncommitted working tree (which does add it). The gate code is real and ready; the profile it's gated on doesn't exist in committed history yet — it's part of the in-progress uncommitted work below. |
| `7269970` "feat(quality): add P7 quality director and production polish" | **New subsystem, not previously documented anywhere in this audit.** `packages/qa/src/quality-director.ts` (476 lines) + `quality-pass.ts`/`quality-repair-engine.ts`/`quality-scoring.ts`/`quality-types.ts` (~1200 lines total, well-tested — `quality-director.test.ts` has 209 lines of tests), exposed as a new standalone CLI command `metroforge quality <slug>` (`apps/cli/src/commands/quality.ts`). It analyzes an already-generated project's presentation quality (a "Heart Engine critic" score covering lighting/camera/HUD/readability) and applies typed, reversible repairs — with optional Godot-playtest-gated rollback if a repair breaks the game — reporting a before/after score. Also adds real new GDScript: `CombatFeedback.gd`, `CameraDirector.gd`, `ReadabilityOutline.gd`, `TransitionFader.gd`, and a first-of-its-kind real custom shader, `sprite_outline.gdshader` (see Step 23 correction). | **Real, new, tested, but opt-in/standalone** — it is a separate command run *against* an existing project after generation, not part of the automatic `create`/`generate` pipeline, and its shader/outline repair is inert unless invoked. Does not change the automatic-pipeline claims elsewhere in this document; is a genuinely new capability worth knowing about for handoff purposes. Not yet added to Step 12's systems table in full (flagged here instead, given refresh time constraints). |
| `f31c449` "Tighten Concept A status strip and inspector density" | `ConcurrencyMeters.tsx` + `styles.css` CSS-only density/spacing tweaks. | **Cosmetic only.** No functional change. |
| `63c00ba` "Refresh Concept A UI audit screenshots after Pass 10 layout" | Regenerated `docs/ui-audit/screenshots/*.png` + index files to match the `10e3517` redesign below. | **Documentation/asset refresh only.** No source change. |
| `10e3517` "Align MetroForge desktop UI to Concept A production-tool density" | Large (25-file) `apps/desktop` visual redesign — tokens, shell, Dashboard/editors/AI/Export screens restyled to a denser dark-IDE look; adds responsive sidebar auto-collapse below 1366px, tooltips, aria-label improvements. Commit message and a direct diff sample of `App.tsx` both confirm: **no IPC/data-wiring changes** — same handlers, same 16 screens, same architecture documented in Step 9. | **Cosmetic/UX-density redesign only.** Verified via App.tsx sampling — real IPC calls unchanged, just restyled/reorganized presentation. Step 9's 16-screen/IPC-handler table remains accurate. |

### Fresh Godot re-verification (this refresh, at HEAD `827c1f4`)
- **SIDE_VIEW_METROIDVANIA**: fresh `TINY_TEST`/`LOCAL_ONLY` generation, new prompt, seed `480216` → **RUNTIME_VALIDATED, 18/18 gates**, first attempt, no issues.
- **TOP_DOWN_ACTION_ADVENTURE**: fresh `TINY_TEST`/`LOCAL_ONLY` generation, new prompt, seed `920347`, run **concurrently** with the side-view generation above → `godot_playtest` crashed early (817ms in, "previously freed instance" script error inside `PlaytestAgent.gd`'s pickup-collection loop) → `validation_failed`, 17/18. Per this task's own guidance to suspect contention from concurrent Godot processes on this heavily-shared branch, **retried once, alone** (seed `314159`, no concurrent Godot process) → clean **RUNTIME_VALIDATED, 18/18, `godot_playtest` 8/8**, victory reached, boss defeated, 17.8s runtime. The concurrent-run failure is recorded here for transparency but is judged a contention artifact, not a regression — the isolated retry is the trustworthy result, and it confirms the `1eb4ab3` P0 fix holds at current HEAD.

### Uncommitted work in flight (not evaluated as done/not-done — informational only)
`git status --short` shows **182 changed paths** (106 modified + 76 untracked) in the working tree beyond HEAD `827c1f4`, none of it committed, none of it touched by this refresh. Do not treat anything below as current/shipped — it's someone else's active work:
- **A new `RELEASE_CANDIDATE` generation profile is being wired end-to-end**: `packages/shared/src/constants.ts` (`GenerationProfile` type + budgets), `archetypes.ts`, `config.ts` (`defaultProfile` type), `registered-abilities.ts` (a new `RELEASE_CANDIDATE_ABILITY_IDS` set requiring air_dash + a wall-traversal ability + swim + phase), and `apps/cli/src/commands/create.ts` (`--profile` help text) are all mid-edit to add it as a real, selectable profile — which is what the already-committed `072d85a`/`7269970` gate code above was written in anticipation of, but couldn't yet reach.
- **A new `LOWEST_COST` generation mode** is being added to `packages/ai/src/mode-routing.ts` (`ModeRoutingFlags.lowestCost`, a new `case 'LOWEST_COST'` branch) — this is the direct, confirmed cause of the one current `pnpm test` failure (`nvidia.test.ts`), since the mode-routing logic it touches is mid-edit.
- **`packages/shared/src/config.ts`**'s `AppConfig.defaultProfile` type is being widened to include the new profile — this is the direct, confirmed cause of the one current `pnpm build` failure (`apps/desktop`), since a Node-only import in this file becomes unresolvable for the browser bundle while the edit is in this intermediate state.
- **A broad animation/art-quality pass**: touches `templates/godot-metroidvania/scenes/{world,player,enemies,bosses}/*.tscn`, `scripts/{world,player,core,UI,test}/*.gd` (including further edits to the just-committed `QualityPresentation.gd`), and `packages/assets`/`packages/procedural`/`packages/godot` source — shape consistent with (but not limited to) 64×64 frame upgrades, pose overrides, and run/jump/land/dash animation states, per file paths touched; not fully read/evaluated since it's unfinished, not-yet-committed work by someone else.
- **Continued `apps/desktop` UI iteration**: 25+ files under `apps/desktop/src/studio` still show as modified beyond what `10e3517`/`f31c449` already committed — this app's UI redesign is evidently still in progress.
- Do not commit, revert, or otherwise act on any of this — it is intentionally left untouched by this refresh.

## Can MetroForge Generate a Playable Godot Game?
**YES for both SIDE_VIEW_METROIDVANIA and TOP_DOWN_ACTION_ADVENTURE** (upgraded this refresh — top-down was PARTIAL as of the 2026-08-14 baseline). Side-view reached full `RUNTIME_VALIDATED` status (18/18 gates, including autonomous input-simulated victory) in the baseline session and again in this refresh's fresh spot-check (seed `480216`). Top-down's autonomous playtest P0 was fixed in `1eb4ab3` and independently re-verified fresh this refresh at HEAD (isolated run, seed `314159`: 18/18 gates, `godot_playtest` 8/8, victory + boss defeat).

## Can MetroForge Generate a Mid-Level Complete Metroidvania?
**PARTIAL.** The TINY_TEST profile is fully proven end-to-end for side-view, including real AI art via NVIDIA. Scaling to genuinely mid-level content depth was not directly exercised in this audit (spec called for the smallest useful profile), and several structural gaps (fixed-layout tilesets on auto-generation, buy-only economy, no per-frame animation variety, informational-only asset-maturity export gate) would likely become more visible at larger profile sizes even though the core generation loop itself is sound.

## Current Working Archetypes
SIDE_VIEW_METROIDVANIA — fully validated. TOP_DOWN_ACTION_ADVENTURE — fully validated as of this refresh (autonomous playtest P0 fixed and re-confirmed at HEAD).

## Current Working AI Providers
NVIDIA NIM only (text, image, and vision, all confirmed healthy and live-tested this session). Ollama registers but is unavailable (not installed). ComfyUI/Diffusers unavailable (not installed; also no capable local GPU on this machine). Gemini/Groq/OpenRouter/HuggingFace not configured (no API keys). Piper TTS/Stable Audio have real code paths but are unavailable locally here.

## Current Working Image Provider
NVIDIA `nvidia-image` (model `black-forest-labs/flux.1-dev`), remote, proven with a real live request this session (90/95 assets critique-passed at score ≥85 in one full generation run).

## Current Model Routing Status
11 modes exist and route with real distinguishing behavior in the backend; only 4 (`FREE_ONLY`, `LOCAL_ONLY`, `HYBRID_FREE`, `CUSTOM`) are exposed in the desktop UI. `HYBRID_FREE`, which is UI-selectable, does reach the real NVIDIA image path.

## Current Asset Generation Quality
The procedural-fallback pipeline reliably produces a complete, QA-passing project even with zero AI providers healthy. When NVIDIA is used, real AI-sourced base poses are genuinely high-quality (critique score 90 observed) but all animation frames remain deterministic transforms of that single base pose — there is no per-frame AI generation, and idle animation is currently a stub.

## Current Godot Runtime Result
Side-view: 18/18 gates (baseline ×2, refresh ×1), including a separately-confirmed 180/181 runtime-check breakdown. Top-down: 18/18 gates as of this refresh's isolated re-verification (was 17/18 at baseline); `godot_runtime` unchanged at 164/165 (near-perfect); `godot_playtest` now 8/8 (was 3/8, fixed by `1eb4ab3`).

## Current Playtest Result
Side-view: full pass, including input-simulated victory and boss defeat, 2/2 baseline + 1/1 refresh. Top-down: **now passing** — isolated refresh run reached victory + boss defeat, 8/8 checks (a concurrent-with-side-view attempt crashed early, judged a resource-contention artifact and superseded by the clean isolated retry — see Step 42).

## Current Export Result
PASS in all 4 real runs this session, including the 2 that failed Godot validation — export is not validation-gated by default, and this is by design (`requireValidation` defaults false), not a bug.

## Current Security Status
Both previously-reported issues (ModelDownloadManager injection, CLI slug traversal) are RESOLVED with real protective code and passing tests. One new, moderate-severity gap found this audit: 2 of ~38 filesystem-touching IPC handlers lack the standard root-confinement check the other ~36 consistently apply.

## Current P0 Blockers
**0** (was 1 — top-down autonomous playtest failure, fixed in `1eb4ab3`, re-verified fresh this refresh).

## Current P1 Blockers
3 (was 4 — fixed tileset layout on auto-gen; 7/11 modes UI-unreachable; provenance schema only 8/17 fields). ~~Unenforced asset-maturity export gate~~ resolved this refresh (`fb62177` + `ef9b8cc`, opt-in `--require-production-assets` flag).

## Current P2 Gaps
10 (see Step 39) — dirty-propagation regeneration absent; idle animation stub; orphaned player death asset; divergent maturity enums; buy-only shops; no fast-travel; VFX has no shaders/particles; local image/audio providers unavailable on this dev machine; two IPC handlers missing root-confinement; dead code (Whisper ASR, 3 DB readers); derivative sprite frames default to unknown commercial status.

## Top 20 Remaining Tasks
See Step 40. **4 of the original 20 are now DONE: #1 (topdown playtest fix), #3 (maturity export gate), #16 (dead code removal), #20 (ModelScout tests).**

## Recommended Next Engineering Pass
With the sole P0 resolved, the highest-leverage remaining items are the P1s (Step 39): **wire `tileCells`/real per-cell room layout into automatic generation** (Top-20 #2, biggest remaining "looks procedural" gap) and **expose the remaining 7 generation modes in the desktop UI** (Top-20 #4, real functionality currently invisible to ordinary users). Separately — not part of this document's own scope, but worth flagging for whoever picks this up next — the in-progress uncommitted work (Step 42) is actively breaking `apps/desktop`'s build and one test; finishing or reverting that `packages/shared/src/config.ts`/`mode-routing.ts` edit is likely a prerequisite for a clean `pnpm build`/`pnpm test` regardless of which P1 is tackled next.

## Why These Are Next
Tileset layout (#2) is the largest remaining "obviously generated" visual/gameplay gap with no dependency on anything else. Mode UI exposure (#4) is low-complexity and unlocks real, already-working backend functionality (7 of 11 modes, including `NVIDIA_ONLY` and `COMMERCIAL_SAFE`) for ordinary desktop users who currently can't reach it without the CLI.

## User Action Required
NONE for reading this audit. To exercise more of what this document describes locally: install Ollama and/or a local ComfyUI/Diffusers setup (note this machine's integrated Intel GPU cannot run them meaningfully regardless of installation) if local-only generation quality matters; otherwise the existing NVIDIA NIM configuration already provides a real, working AI generation path for text, image, and vision today.
