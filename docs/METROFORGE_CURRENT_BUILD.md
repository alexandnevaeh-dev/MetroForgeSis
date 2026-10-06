# METROFORGE — CURRENT AUTHORITATIVE BUILD STATE

**This document describes the CURRENT state of the repository only.** Every claim below traces to a command run, a file read, or a real generation executed during this audit session. Superseded/historical findings have been moved to `docs/METROFORGE_CHANGE_HISTORY.md` — do not treat anything in that file as current.

> **Last refreshed: 2026-08-16 ~21:00 America/Chicago (UTC-5), VGF-2 pass, source HEAD `4eac098` ("feat(vgf-2): replace slab mid/near parallax with sparse architecture").** Starting HEAD for VGF-2 was `8e3e093`. See **STEP 44**. Live Godot evidence in Step 44 is from fresh project `vgf2-tideglass-nave` (seed `20260817`, `VISUAL_VERTICAL_SLICE`). Human visual approval is **not** granted. Untracked non-source remains `.agents/`, `.claude/skills/`, `.metroforge/`, `Exports/`, zip, tmp images. Do not treat `HUMAN_APPROVED` as automatic.

---

## STEP 1 — Repository Identity

| Field | Value |
|---|---|
| Audit timestamp | **Current: 2026-08-16 ~17:45 local.** Original baseline: 2026-08-14, ~10:12–10:50 local (America/Chicago, UTC-5) |
| Git branch | `feature/claude-generation-runtime` |
| Git commit (HEAD at time of writing) | **`8e3e093`** — "feat(vgf-1): reject wallpaper captures and bake climb-row room silhouettes". Prior refresh HEAD: `827c1f4`. Original baseline: `5917bf95eb0d76ac0a0caf3b6790c6e1db95e5df` |
| Working tree state | Theme packages/templates **clean** at `8e3e093`. Untracked non-source: `.agents/`, `.claude/skills/`, `.metroforge/`, `Exports/`, `metroforge-redesign-audit.zip`, tmp images. **Local branch is ahead of origin by 1** (`8e3e093` not pushed). |
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

**Refreshed 2026-08-16 at HEAD `827c1f4` (historical — do not average with the 2026-08-14 baseline; also do not treat as HEAD `8e3e093` current):**

| Command | Result | Detail |
|---|---|---|
| `pnpm typecheck` | **PASS** | 13/13 runnable workspace projects, 0 errors — unchanged from baseline. |
| `pnpm test` (`vitest run`) | **FAIL (1 test)** *at `827c1f4` working tree* | **96 test files (95 passed, 1 failed), 498 tests.** Failure was `packages/ai/src/providers/nvidia.test.ts` ("is included as a candidate under FREE_ONLY") from an **then-uncommitted** `LOWEST_COST` edit. **`LOWEST_COST` is now committed** (`mode-routing.ts` + schemas + desktop `GENERATION_MODES`). This refresh did not re-run vitest at `8e3e093`. |
| `pnpm build` (`pnpm -r run build`) | **FAIL (1 of 13 projects)** *at `827c1f4` working tree* | `apps/desktop` failed because an uncommitted `config.ts` widening sat next to Node-only imports. **`packages/shared/src/config.ts` now imports `GenerationMode` / `GenerationProfile` from `constants.js`** (landed in the post-`827c1f4` batch). This refresh did not re-run `pnpm build` at `8e3e093`. |

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

`packages/shared` defines exactly **12** `GenerationMode` values, all handled with real distinguishing behavior in `packages/ai/src/mode-routing.ts`'s `modeRoutingFlags()`: `FREE_ONLY, LOCAL_ONLY, HYBRID_FREE, CUSTOM, NVIDIA_ONLY, COMMERCIAL_SAFE, OFFLINE, FASTEST, HIGHEST_QUALITY, LOW_VRAM, BALANCED, LOWEST_COST`.

**Desktop UI (`apps/desktop/src/studio/generation-options.ts`) exposes 11 of the 12** — `FREE_ONLY, LOCAL_ONLY, HYBRID_FREE, CUSTOM, NVIDIA_ONLY, OFFLINE, FASTEST, HIGHEST_QUALITY, LOWEST_COST, BALANCED, COMMERCIAL_SAFE`. Consumed by Create / Generation Studio / Settings / Generate Asset. **The only backend mode missing from the dropdown is `LOW_VRAM`.** (Prior claim "only 4 of 11" is superseded — see Change History.) Note `NVIDIA_ONLY` does **not** actually restrict image-provider candidates to NVIDIA only (only `LOCAL_ONLY` filters image candidates by locality — see Step 15/16); `HYBRID_FREE`, which is desktop-selectable, reaches the real NVIDIA image path just as effectively.

---

## STEP 14 — Providers

**13 provider adapters** exist in current source:

- **Text (6)**: Ollama (local, enabled by default, unavailable — not installed), Gemini/Groq/OpenRouter/HuggingFace (cloud, disabled — no API key), NVIDIA NIM (cloud, **enabled and healthy** — key configured, endpoint reachable).
- **Image (3)**: ComfyUI (local, unavailable), Diffusers (local, unavailable), NVIDIA image (remote, **live**).
- **Vision (1)**: NVIDIA vision critic (remote, **live**, used for real QA critique).
- **Speech (2)**: Piper TTS (local, wired but unavailable — no ONNX model resolved on this machine), Whisper ASR (local, **wired** — `transcribe-speech` IPC → `WhisperAsrProvider`; desktop `CommandBar.tsx` calls `transcribeSpeech`. Still unavailable here if no Whisper model is on disk).
- **Embedding (1)**: Ollama embeddings (local, depends on Ollama — unavailable).

Only NVIDIA (text + image + vision) is actually live on this machine today. All other unavailability is explained by "not installed locally" (and, for image/audio diffusion, by the absence of a capable local GPU) rather than by missing code — every non-NVIDIA provider has real adapter code and a real call path; they are simply not reachable in this specific environment.

---

## STEP 15 — NVIDIA Dedicated Section

| Capability | Classification | Evidence |
|---|---|---|
| Text generation | **IMPLEMENTED** | `NvidiaProvider.generateText()` — real `/chat/completions` calls, retry/backoff, key redaction |
| Code / reasoning | **IMPLEMENTED** | Same text adapter, routed via capability mapping; catalog includes `nemotron-70b`, `deepseek-coder-6.7b` |
| Image generation | **IMPLEMENTED** | `NvidiaImageProvider.generateImage()` — real `POST` to `ai.api.nvidia.com/v1/genai/{model}`, default model `black-forest-labs/flux.1-dev`. **Confirmed live this session** (90/95 real assets in a fresh run). |
| Image editing | **PARTIAL / BLOCKED** | `flux.1-kontext-dev` is cataloged and the NVIDIA image adapter posts Kontext conditioning as a data URI. Hosted preview returns **HTTP 422** (`Expected: example_id, got: base64`) on custom sprites. Asset pipeline forces `allowAiUpgrade: false` so pose generation does not burn retries. Identity animation is STOPPED until a provider actually accepts custom reference images. |
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
| VFX | 9 procedural textures (prior 8 plus `landing_dust`); **always procedural**, never AI-routed even when an image provider is healthy |
| Weapon / Item / Prop | Supported only via the **manual** single-asset generation path (`generateManual()`), not the automatic bulk pipeline |
| Background / Icon / Portrait / UI / Music / SFX / Voice | No dedicated asset-pipeline generation exists; Music/SFX/Voice are handled entirely by separate procedural-audio and TTS modules (Step 24); Portrait is a hardcoded color rect, not an image (Step 26) |

Every still image goes through the same real flow: procedural placeholder generated first as guaranteed fallback → real AI generation attempted if a healthy `ImageGenerator` was resolved (priority ComfyUI 90 > NVIDIA 88 > Diffusers 85) → AI source bytes preserved as a `_source.png` sidecar → both AI and procedural buffers run through `PixelArtProcessor` (nearest-neighbor scale → palette quantize → alpha-threshold cleanup; poses/sheets can `skipQuantize`) → deterministic checks always run, VLM critique runs if a vision critic is available → checkpointed to disk and recorded in the manifest. **Animation sheets and canonical pose stills are deterministic pixel transforms of the still's base pose.** AI-conditioned pose upgrade exists in code (`tryCanonicalPoseSet`) but is **forced off** because NVIDIA flux.1-kontext-dev 422s on custom sprites. There is no working per-frame AI generation for any animation state.

---

## STEP 18 — Asset Maturity

`packages/shared/src/asset-maturity.ts` defines exactly 8 states: `PLACEHOLDER, BLOCKOUT, GENERATED_SOURCE, PROCESSED, COMPILED, QA_REVIEW, PRODUCTION_READY, REJECTED`. In practice, only `PLACEHOLDER, GENERATED_SOURCE, COMPILED, QA_REVIEW, PRODUCTION_READY, REJECTED` are ever actually assigned by current inference logic — `PROCESSED` and `BLOCKOUT` are defined but dormant. A second, divergent 7-value schema exists in `packages/schemas/src/core.ts` (missing `PROCESSED`) — the two enums have drifted apart.

**[RESOLVED this refresh] A placeholder can no longer silently pass production export if the caller opts in.** Two composing commits landed since the baseline: `fb62177` fixed `inferAssetMaturity()` so a critique score alone never auto-promotes an artifact to `PRODUCTION_READY` (previously a high score could false-promote a still-unreviewed asset; now score-passing artifacts stop at `QA_REVIEW` and `PRODUCTION_READY` must be set explicitly), and `ef9b8cc` added an opt-in `requireProductionAssets` flag to `exportProject()` (mirrors the existing `requireCommercialSafe` pattern exactly): when set, export is blocked with a real error + sample artifact list if any artifact's maturity is in `NON_PRODUCTION_MATURITIES` (`PLACEHOLDER`/`BLOCKOUT`/`REJECTED`); otherwise an advisory warning is emitted (unchanged default behavior). Wired to the CLI as `export --require-production-assets`. Verified end-to-end during the original session: a real 100%-placeholder `TINY_TEST` project was generated and `export --require-production-assets` genuinely blocked it with a readable error. Default (`export` with no flag) behavior is unchanged — a placeholder-only project still exports successfully unless the new flag is passed, so this is an *available* enforcement, not a default-on one; the desktop Export screen does not yet expose this flag (a smaller follow-on gap, not tracked separately in Step 39).

---

## STEP 19 — Artifact Provenance

The real, on-disk `generation_manifest.json` currently records, per artifact: `id, path, type, provider, modelId, fallbackGenerated, critiquePassed, critiqueScore, maturity, productionReady, sourceType, fallbackDepth, fallbackReason, selectedProvider, selectedModel, requestedCapability, productionAllowed, license, commercialUse`, plus on many visual artifacts `parentArtifactIds` and (on some, e.g. backgrounds) `promptHash`. Top-level manifest `seed` is present. `packages/generation/src/artifact-lineage.ts` defines lineage, `descendantRelPaths`, and `markDescendantsDirty`.

Against the requested 17-field checklist (artifactId, projectId, capability, assetType, provider, model, model version, prompt hash, seed, parent artifacts, compiler, license, commercial status, QA, maturity, repair count, Godot path):

**~11/17 present**: artifactId, capability, assetType, provider, model, license, commercial status, QA, maturity, parent artifacts (when derived), top-level seed.
**Still absent or incomplete**: per-artifact projectId, model version, prompt hash (only some artifacts), per-artifact seed (SQLite create path, not every manifest row), compiler, repair count, merged Godot `res://` path.

Audio artifacts get an even smaller field set (no `maturity`/`critiquePassed`/`modelId` at all).

**[RESOLVED 2026-08-16 evening]** Derived `pixel-art-processor` frames inherit the AI-source parent's `license` / `commercialUse` via `inheritDerivativeLicense` + `parentArtifactIds` when the parent is known. Unknown parents still yield `unknown` by design.

---

## STEP 20 — Asset Dependencies

A real dependency/"where-used" graph exists (`packages/generation/src/dependency-graph.ts`), built from manifest artifacts, room→enemy/tileset relationships, and an actual scan of which `.tscn`/`.gd` files reference each asset's `res://` path. **Full-pipeline dirty-propagation still does not exist.** Character-still replacement on the manual path (`manual-asset.ts`) now calls `markDescendantsDirty` / `descendantRelPaths` and deletes descendant pose/sheet files so they rebuild. Manual room re-edits recompile only the explicitly-targeted room (manual scoping), not graph-derived automatic propagation.

---

## STEP 21 — Sprites

Under the environment tested in the original session: 100% procedural placeholders under `LOCAL_ONLY` (twice confirmed), ~95% real AI-sourced-then-processed under `NVIDIA_ONLY` (once confirmed, 90/95). SpriteFrames/Godot integration itself is real — `AnimatedAssetSprite.gd` builds a runtime `SpriteFrames` resource by slicing the compiled sheet into `AtlasTexture` frames, with a safe solid-color fallback if a sheet file is missing. Feet-anchor, nearest filter, optional `sprite_foot_clean.gdshader` (in `8e3e093`), and pose-override loading are current.

**[RESOLVED]** Idle is no longer a walk-frame-1 stub. `599244e` added deterministic pose stills (`player_idle_pose.png` etc.); runtime loads pose overrides and only falls back to walk[0] if idle is empty.

**[RESOLVED]** Player death sheet is wired: `templates/godot-metroidvania/scenes/player/Player.tscn` sets `death_sheet_path = "assets/characters/player_death.png"`; `PlayerController.gd` plays `"death"`.

**Still current:** identity/posed AI animation is STOPPED (Kontext 422). Visual-slice human review still reports a tiny silhouette player with mustard contact leftover — the foot-clean shader is local `8e3e093`, unpushed, not recaptured as approved.

---

## STEP 22 — Tilesets

**[RESOLVED as a wiring P1]** Automatic room generation now calls `buildRoomTileCells()` from `buildRoomAssemblyOptions()` (`packages/godot/src/room-assembler.ts` + `tile-layout.ts`, commits `324951d` / vgf-1 / `8e3e093`). Fresh auto-generated rooms emit non-trivial `painted_cells_json`, movement-bounded platforms/pits, climb rows, and archetype-distinct silhouettes. `RoomTileMap.gd` no longer wallpaper-fills playable air. Scene critic + QA validator **hard-fail** wallpaper/occupancy captures (`8e3e093`).

**Still current (look, not wiring):** compiled atlas still photographs as dark navy slabs; no Godot terrain-set/autotile. Far/mid/near parallax paths exist on the assembler but the visual-slice packet still reads as one dusk plate. This is now a visual-quality P1, not a "tileCells unwired" P1.

---

## STEP 23 — VFX / Shaders

VFX textures are generated **100% procedurally, always** — the VFX generation loop has no AI-provider call even when NVIDIA image generation is healthy. Current set includes the original eight (`hit_spark, death_puff, dash_trail, pickup_spark, ability_unlock, boss_phase_shift, area_burst, slam_shock`) plus **`landing_dust`** (`8e3e093`); `PlayerController.gd` uses `landing_dust` on land rather than `slam_shock`.

**[RESOLVED]** `VFXManager.gd` is a pooled **`GPUParticles2D`** system (not sprite+Tween-only). Finished emitters are hidden. No weather system and no screen-space post-processing.

**Shaders (current):**
- `sprite_outline.gdshader` + `ReadabilityOutline.gd` — 1px silhouette. QualityDirector now **auto-runs** after passing validation on `PRODUCTION_QUALITY_PROFILES` (`SMALL`, `MEDIUM`, `LARGE`, `RELEASE_CANDIDATE`, `VISUAL_VERTICAL_SLICE`) via `runQualityPass` in `pipeline.ts`. TINY_TEST still skips. Standalone `metroforge quality <slug>` remains available.
- `sprite_foot_clean.gdshader` — discards pale/red/magenta contact-band leftovers; loaded by `AnimatedAssetSprite.gd` when present. Landed in local `8e3e093`.

---

## STEP 24 — Audio

The "11 audio files (2 MIDI, 2 tracker-interchange JSON)" seen in every real generation run this session breaks down as: one procedurally-synthesized biome-loop WAV + title + boss music (each paired with a real Standard MIDI export and a JSON "tracker-interchange" file — an explicitly-documented manual-recreation aid for musicians, **not** an importable tracker project) plus 8 procedurally-synthesized SFX WAVs.

**Stable Audio (real AI music enhancement) has a real, wired call path** (`enhanceMusicWithStableAudio()`, called unconditionally right after procedural music generation in the pipeline) that spawns a local Python diffusers worker — it silently no-ops when that worker isn't healthy, which is the case on this machine (same "not installed locally, no capable GPU" situation as image generation). **Piper TTS for dialogue voice lines** has the same real-but-locally-unavailable pattern. **Whisper ASR is wired** (`transcribe-speech` IPC, `CommandBar.tsx`) — not dead code. Still locally unavailable here without a Whisper model on disk.

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
- **Personas**: **4 defined** — `victory_rusher` (fast, 8s walk / 12s boss timeout) and `ability_collector` (patient, 12s / 14s), both auto-selected by profile size as before, plus `critical_path` (10s / 16s) and `explorer` (14s / 16s) from `630ad61`. **`RELEASE_CANDIDATE` is now a real `GenerationProfile`** in `packages/shared/src/constants.ts`, CLI `--profile`, and desktop `GENERATION_PROFILES`, so those two personas are reachable when that profile is selected. `MASS_VISUAL_PROFILES` (`LARGE`, `RELEASE_CANDIDATE`) cannot mass-generate final art until `visualSliceApproved === true` (`packages/shared/src/visual-slice.ts`).
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
- ~~`packages/ai/src/providers/whisper-asr.ts` — implemented and tested, but has no call site anywhere else in the codebase (Step 24).~~ **[RESOLVED]** Wired via `transcribe-speech` / CommandBar.
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
| World generation | Medium-High | Real graph/reachability; auto-gen tileCells wired; atlas still slabby |
| Progression | High | Ability/item gating real and runtime-proven |
| Godot runtime (side-view) | High | 18/18, 265-check smoke test |
| Godot runtime (top-down) | High | 18/18 fresh, 164/165 smoke, playtest 8/8 |
| Godot assembly | High | Archetype-correct, room-fidelity bug fixed |
| Player | High | Full movement/combat/death/respawn; death sheet wired |
| Combat | High | Real hitbox/hurtbox both archetypes |
| Abilities | Medium-High | 6/9 FULL, 3/9 PARTIAL (wall_slide/wall_jump/air_dash still lack dedicated smoke checks) |
| Enemies | High | Data-driven, real |
| Bosses | High | Data-driven, phased, weakness mechanics |
| NPCs | Medium | Real dialogue/shop, but static (no movement/schedule) |
| Dialogue | High | Real branching |
| Quests | High | 10/10 type parity, EventBus/save/UI wired |
| Inventory/economy | Medium-High | Real, but buy-only shops, pause-menu-only HUD |
| Map | High | Real, fog of war, save-persisted, no fast-travel |
| Save | High | Migration, backup recovery, multi-slot, all proven |
| Asset Foundry (pipeline architecture) | High | Real AI-capable pipeline with guaranteed fallback |
| Image generation | Medium | Real and proven, but only 1 of 3 image providers reachable here; Kontext edit 422s |
| Sprite generation | Medium-High | Real base-pose + idle/death wired; identity AI STOPPED |
| Animation | Medium | Deterministic poses; no working per-frame AI |
| Tilesets | Medium | Auto-gen layout wired; atlas/autotile look still weak |
| UI assets | Low | Portraits are color rects, no real UI-asset pipeline |
| VFX | Medium-High | GPUParticles2D pool + landing_dust + outline + foot-clean; always procedural textures; no weather |
| Music | Medium | Real procedural + MIDI; AI enhancement path exists but unavailable here |
| SFX | Medium-High | Real, procedural, well-integrated (buses/pooling) |
| Speech | Medium | TTS path exists but unavailable here; Whisper ASR wired to CommandBar |
| Vision QA | Medium-High | Real NVIDIA vision critique, live; wallpaper occupancy now hard-fail |
| QA/repair | High | 18-gate system, real bounded repair loop; QualityDirector auto on production profiles |
| Playtesting | High | Both archetypes; 4 personas; RELEASE_CANDIDATE profile real |
| Export | Medium-High | Real packaging; CLI `--require-production-assets` opt-in; desktop UI does not expose it |
| Commercial-safe workflow | Medium-High | License auditing + derivative inheritance when parent known |

**PLAYABLE VERTICAL SLICE READINESS: HIGH technically / FAIL aesthetically.** Both archetypes reach RUNTIME_VALIDATED. `reports/VISUAL_VERTICAL_SLICE.md` is `VISUAL_SLICE_REVIEW_REQUIRED` — human approval not granted. MASS art for LARGE / RELEASE_CANDIDATE is blocked until `visualSliceApproved === true`.

**MID-LEVEL GAME GENERATOR READINESS: MEDIUM.** TINY_TEST is fully proven end-to-end; scaling is limited by visual identity (Kontext STOP, slab tilesets, dusk-plate parallax), buy-only economy, and no fast-travel — not by the core generation loop.

**PRODUCTION READINESS: LOW-MEDIUM.** Pipeline, QA, and security choke points are solid. Production-quality *look* is not approved. Default export still allows placeholders unless `--require-production-assets` is passed. Desktop Export screen still does not expose that flag.

---

## STEP 39 — Current Blockers

### P0 — generated game cannot reliably complete/run
**NONE — 0 P0 as of this refresh.** ~~TOP_DOWN_ACTION_ADVENTURE's autonomous playtest/victory-proof currently fails.~~ Fixed in commit `1eb4ab3` (root-caused to terrain generation creating diagonal tile pinches / POIs on blocked cells that froze the playtest bot) and re-verified fresh in this refresh at HEAD (isolated run, seed `314159`, `godot_playtest` 8/8, RUNTIME_VALIDATED 18/18). Full writeup moved to `METROFORGE_CHANGE_HISTORY.md`.

### P1 — blocks mid-level complete game generation / visual approval
1. ~~Auto-generated rooms still use the fixed rectangular floor/wall tile layout~~ **[RESOLVED]** `324951d` + vgf-1 + `8e3e093`. Remaining gap is atlas/parallax *look*, tracked as the visual P1 below.
2. ~~The production-asset-maturity gate does not block export~~ **[RESOLVED]** `fb62177` + `ef9b8cc`. Desktop Export screen still does not expose `--require-production-assets`.
3. ~~Desktop UI exposes only 4 of 11 generation modes~~ **[RESOLVED except `LOW_VRAM`]** 11/12 modes in `generation-options.ts`.
4. Artifact provenance is incomplete — `parentArtifactIds` and license inheritance exist; `promptHash` / per-artifact `seed` are not populated on every manifest row.
5. **Visual vertical slice is not approved.** Flux.1-Kontext hosted preview 422s on custom sprites; `allowAiUpgrade` is forced off; MASS art for LARGE/RC is blocked. This is the current product gate.

### P2 — major production quality/depth gap
1. No *full-pipeline* dirty-propagation (manual character still invalidation exists; dependency-graph remains query-oriented for rooms).
2. ~~Idle animation stub / orphaned player death sheet~~ **[RESOLVED]** `599244e` + `Player.tscn` `death_sheet_path`.
3. Two divergent asset-maturity enum definitions exist (`asset-maturity.ts` includes `PROCESSED`; `schemas/core.ts` does not).
4. Shops are buy-only — no sell mechanic exists anywhere.
5. No fast-travel on the generated world map.
6. ~~VFX has no particle systems~~ **[RESOLVED]** GPUParticles2D + `landing_dust` + shaders. Still no weather / screen-space post. VFX textures remain procedural-only.
7. On this development machine specifically, local image (ComfyUI/Diffusers) and local audio (Stable Audio worker, Piper TTS) providers are all unavailable — real AI output is reachable only via the cloud NVIDIA path and only when a non-`LOCAL_ONLY` mode is chosen.
8. Two IPC handlers (`get-project-preview`, `open-in-godot`/`play-in-godot`) lack the root-confinement check the app's ~36 other filesystem-touching handlers consistently apply.
9. ~~`WhisperAsrProvider` unused~~ **[RESOLVED]**. Three DB-table readers (`JobRepository.findById`, `ArtifactRepository.listByJob`, `generation_stages`) remain write-only.
10. ~~Derived frames default to unknown commercialUse~~ **[RESOLVED when parent known]**. Unknown parents still yield unknown.
11. `wall_slide` / `wall_jump` / `air_dash` still lack dedicated `RuntimeSmokeTest.gd` checks (abilities are real; QA depth is PARTIAL).
12. Top-down `WeakFloor` remains in `REQUIRED_FILES` despite being gameplay-dead.
13. Top-down dungeons are still a fixed 4-room template; no mini-boss.

### P3 — enhancement/future scope
NVIDIA speech/embeddings/reranking/safety/3D not implemented; no localization; NPCs have no movement/schedules; no audio loudness normalization.

---

## STEP 40 — Top 20 Current Remaining Engineering Tasks

Ranked by user value, dependency order, correctness, generation quality, risk, and commercial readiness. **Original 20 numbering kept.** Closed since the first audit: #1, #2 (wiring), #3, #4 (except LOW_VRAM), #6, #7, #8, #15, #16 (partial), #17 (particles), #20.

1. ~~**Diagnose and fix the top-down `godot_playtest` failure.**~~ **[DONE]** `1eb4ab3`. Re-verified at `827c1f4`, isolated seed `314159`: 18/18, playtest 8/8.
2. ~~**Wire `tileCells`/real per-cell layout into automatic room generation.**~~ **[DONE as wiring]** `324951d` + vgf-1 + `8e3e093`. **Replacement task:** tileset *atlas/autotile look* and true parallax (rooms still photograph as navy slabs over a dusk plate).
3. ~~**Enforce the asset-maturity gate at export.**~~ **[DONE]** `fb62177` + `ef9b8cc`. Remaining: expose the flag on the desktop Export screen.
4. ~~**Expose the remaining 7 generation modes in the desktop UI.**~~ **[DONE except `LOW_VRAM`]** 11/12 modes in `generation-options.ts`. Add `LOW_VRAM` to the dropdown.
5. **Populate `promptHash` and per-artifact `seed` on every manifest row.** Parent lineage and license inheritance exist. Acceptance: a fresh manifest's artifacts contain non-null `promptHash` and `seed`. Complexity: Medium.
6. ~~**Re-license `pixel-art-processor`-derived frames from their AI-source parent.**~~ **[DONE when parent known]** `inheritDerivativeLicense` + `parentArtifactIds`.
7. ~~**Implement a real idle animation sheet.**~~ **[DONE]** `599244e` deterministic pose stills + runtime pose overrides.
8. ~~**Wire `death_sheet_path` for the player's base `Player.tscn`.**~~ **[DONE]** `Player.tscn` sets `assets/characters/player_death.png`.
9. **Reconcile the two divergent asset-maturity enums.** Reason: P2, schema drift. Affected: `asset-maturity.ts` vs `schemas/core.ts` (`PROCESSED` missing from Zod). Complexity: Low.
10. **Add a sell mechanic to `ShopManager`/`ShopOverlay`.** Reason: P2, economy depth. Complexity: Medium.
11. **Add root-confinement checks to `get-project-preview` and `open-in-godot`/`play-in-godot`.** Reason: P2, security consistency. Affected: `apps/desktop/electron/handlers.ts`. Complexity: Low.
12. **Add automatic dirty-propagation/selective regeneration** for rooms/tilesets (character-still invalidation already exists on the manual path). Complexity: High.
13. **Add a fast-travel option to the map system.** Reason: P2. Affected: `MapManager.gd`, `WorldMapPanel.gd`. Complexity: Medium.
14. **Wire generation_jobs/generation_stages/artifacts(DB) readers, or remove them.** Reason: P2, dead readers. Complexity: Low (remove) to Medium (wire in).
15. ~~**Remove or wire `WhisperAsrProvider`.**~~ **[DONE]** `transcribe-speech` IPC + CommandBar.
16. ~~**Remove vestigial top-down gate scripts.**~~ **[DONE, partially]** `657c712`; `WeakFloor` still required by the gate.
17. ~~**Add basic VFX particle/shader support.**~~ **[DONE]** GPUParticles2D + outline + foot-clean + landing_dust. Remaining: weather / screen-space post (P3 polish).
18. **Add audio loudness normalization** to procedural music/SFX synthesis. Complexity: Low-Medium.
19. **Give NPCs basic movement/schedules.** Reason: P3. Complexity: High.
20. ~~**Add a `ModelScout` test file.**~~ **[DONE]** `827c1f4`, 12 tests.

**New #21 (do this before 10–14):** Unblock identity animation (Kontext 422 / `allowAiUpgrade`) and get human visual-slice approval. Do not start LARGE/RC mass art until `visualSliceApproved === true`.
**New #22:** Push local `8e3e093` to origin so GitHub matches disk.

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

## STEP 42 — Refresh Findings (2026-08-16 morning, HEAD `827c1f4`) — historical

This section is the **previous** refresh. Current HEAD is `8e3e093` — see **STEP 43**. Left in place so Step 42's live Godot re-verify (seeds `480216` / `314159`) stays citable.

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

### Uncommitted work in flight
**[SUPERSEDED 2026-08-16 evening — see Step 43.]** The ~182-path dirty tree described here at `827c1f4` was committed as `784b5b3` then vgf-1 / `8e3e093`. `RELEASE_CANDIDATE`, `LOWEST_COST`, and the `config.ts` type aliases are now in HEAD. Do not treat that WIP note as current.

---

## STEP 43 — Refresh Findings (2026-08-16 evening, HEAD `8e3e093`)

Source-and-commit refresh. Did **not** re-run `pnpm test` / `pnpm build` / a full Godot generation campaign. Last live Godot re-verify remains Step 42 (`827c1f4`).

### Commits `827c1f4..8e3e093`
| Commit | What it did |
|---|---|
| `4e5bae1` | Docs refresh of this file to `827c1f4` |
| `324951d` | Auto-generated room geometry movement-bounded, seeded, playable `tileCells` |
| `599244e` | Idle pose fallback — closes walk-frame-1 stub |
| `784b5b3` | WIP snapshot: `RELEASE_CANDIDATE`, Asset Foundry, desktop UI |
| `13dd9e2` | Compiled tileset atlas uses real material texture, not flat fills |
| `1da2d80` | vgf-1 visual generation foundation (rooms, composition, quality) |
| `c26c1f4` | Citadel rooms without wallpapering playable air |
| `8e3e093` | Wallpaper-capture hard-fail + climb-row silhouettes + foot-clean + landing_dust + license inheritance (39 files). **Local tip; not on origin.** |

### Closed vs Step 42 open list
- tileCells auto-gen wiring; idle pose; player death sheet; 11/12 desktop modes; RELEASE_CANDIDATE + LOWEST_COST; QualityDirector auto on production profiles; GPUParticles2D; Whisper CommandBar; derivative license inheritance; wallpaper hard-fail; climb-row archetypes; `config.ts` GenerationMode/Profile aliases (the class of desktop-break Step 42 attributed to uncommitted WIP).

### Still open (do not regress)
- Visual-slice human approval; Kontext 422 / identity AI STOP; tileset atlas look; true parallax picture; `LOW_VRAM` UI; desktop `requireProductionAssets`; promptHash/seed on every artifact; shop sell; fast-travel; IPC root confinement; unread job DB tables; `PROCESSED` enum drift; wall_* smoke checks; top-down WeakFloor vestige; 4-room top-down dungeons.

### Local vs origin
`feature/claude-generation-runtime` is **ahead of origin by 1** (`8e3e093`). Untracked: `.agents/`, `.claude/skills/`, `.metroforge/`, `Exports/`, `metroforge-redesign-audit.zip`, tmp images. Push before assuming GitHub matches disk.

## Can MetroForge Generate a Playable Godot Game?
**YES for both SIDE_VIEW_METROIDVANIA and TOP_DOWN_ACTION_ADVENTURE.** Last live proof: Step 42 isolated runs (side-view seed `480216`, top-down seed `314159`, 18/18).

## Can MetroForge Generate a Mid-Level Complete Metroidvania?
**PARTIAL.** TINY_TEST loop is proven. Visual identity (Kontext STOP, slab tilesets, dusk-plate parallax) and missing economy/map depth (sell, fast-travel) block calling it mid-level complete. LARGE/RC mass art is **blocked** until visual-slice approval.

## Current Working Archetypes
SIDE_VIEW_METROIDVANIA — fully validated. TOP_DOWN_ACTION_ADVENTURE — fully validated (playtest P0 fixed). Top-down dungeons remain a fixed 4-room template.

## Current Working AI Providers
NVIDIA NIM only (text, image, vision). Ollama/ComfyUI/Diffusers/Gemini/Groq/OpenRouter/HuggingFace unchanged from Step 42. Whisper ASR is **wired** but locally unavailable without a model.

## Current Working Image Provider
NVIDIA `nvidia-image` (`black-forest-labs/flux.1-dev`). `flux.1-kontext-dev` is cataloged but hosted preview **422s** on custom sprites — pose AI upgrade is forced off.

## Current Model Routing Status
**12** backend modes including `LOWEST_COST`. Desktop exposes **11**; missing `LOW_VRAM`.

## Current Asset Generation Quality
Procedural fallback still produces a complete project. NVIDIA stills can be high quality. Animation is deterministic poses, not per-frame AI. Idle and death sheets are wired. Visual-slice human review is **not** granted (`reports/VISUAL_VERTICAL_SLICE.md`).

## Current Godot Runtime Result
Last executed: side-view 18/18; top-down 18/18 isolated (`827c1f4` refresh). Not re-run at `8e3e093`.

## Current Playtest Result
Last executed: both archetypes pass isolated. Concurrent Godot processes can false-fail.

## Current Export Result
Default export is not validation-gated. CLI `--require-production-assets` exists; desktop UI does not expose it.

## Current Security Status
Prior injection/traversal issues remain resolved. Two IPC handlers still lack `assertProjectPath`.

## Current P0 Blockers
**0**

## Current P1 Blockers
Visual-slice approval / Kontext identity STOP; tileset+parallax *look*; incomplete per-artifact promptHash/seed; `LOW_VRAM` missing from desktop (small).

## Current P2 Gaps
See Step 39: sell, fast-travel, IPC confinement, unread DB tables, maturity enum drift, ability smoke depth, WeakFloor vestige, 4-room top-down dungeons.

## Top 20 Remaining Tasks
See Step 40. Highest leverage: **#21 visual identity + human approval**, then atlas/parallax look, then push `8e3e093`, then the small UI/security unlocks.

## Recommended Next Engineering Pass
1. Unblock or replace Kontext custom-sprite pose generation.
2. Recapture visual-slice stills (foot-clean is in `8e3e093`) and get human Approve Visual Direction.
3. Tileset atlas/autotile quality and real far/mid/near parallax picture — do not re-wire `tileCells`.
4. Push `8e3e093`. Add `LOW_VRAM` + Export `requireProductionAssets` + IPC `assertProjectPath`.

## Why These Are Next
The generation loop is no longer the bottleneck. The visual slice is the product gate. Wiring P1s from the 01:00 audit are closed.

## User Action Required
Push the VGF-2 branch if GitHub should match disk. Open Generation Studio Visual Review for `vgf2-tideglass-nave` and set `HUMAN_APPROVED` or `HUMAN_REJECTED`. Local ComfyUI/Ollama still need discrete GPU this machine does not have.

---

## STEP 44 — VGF-2 Visual Generation Foundry (2026-08-16 evening)

Implementation pass on `feature/claude-generation-runtime`. Starting HEAD: `8e3e093`. Source tip: `4eac098`.

### Verified this session

| Check | Result |
|---|---|
| `pnpm typecheck` | **PASS** (13/13 runnable workspace projects) |
| `pnpm test` | **PASS** — 108 files, **583** tests, 88s. Includes TINY_TEST e2e (54s, isolated, 300s timeout). |
| `pnpm lint` | **FAIL** — pre-existing `no-undef` in `scripts/*.mjs`, worktrees, `reports/p6-logs`, `tools/redesign-audit`. Package TS: only pre-existing `SettingsScreen.tsx` missing `react-hooks/exhaustive-deps` plugin. **No new package lint errors from VGF-2.** |
| Fresh project | `GeneratedGames/vgf2-tideglass-nave`, seed `20260817`, `SIDE_VIEW_METROIDVANIA` / `VISUAL_VERTICAL_SLICE` / `NVIDIA_ONLY` / `flux.1-dev` |
| Godot import | **PASS** |
| Godot runtime | **PASS** (SOFT_FAIL 183/208 — headless dummy `texture_2d_get` null) |
| Screenshot QA | **PASS score 100** after `windowed_gpu` / d3d12 recapture |
| Playtest | **PASS 8/8**, `gameComplete: true` (from generation run; CLI validate does not re-run playtest) |
| Visual verdict | `AUTOMATED_VISUAL_PASS_HUMAN_REVIEW_REQUIRED` — **not** `HUMAN_APPROVED` |

### Product wiring closed vs Step 43 open list

- Desktop `LOW_VRAM` is in `GENERATION_MODES`.
- Export screen has `Require production-ready assets` (`requireProductionAssets`, default false).
- `get-project-preview` / `open-in-godot` / `play-in-godot` use `assertProjectPath`.
- `PROCESSED` is on the shared `AssetMaturitySchema`.
- Mid/near parallax are no longer full-width occupancy slabs (sparse colonnade + chains; recapture confirms tiled rooms, not purple bars).

### Remaining (honest)

- 0 production-ready assets / 90 placeholders on this slice.
- NVIDIA Kontext custom-reference still disabled; poses are `DETERMINISTIC_DERIVED`.
- Tile repetition still reads as block masonry (`TILE_REPETITION_HIGH`).
- Repair loop is lighting-only; dirty graph is not an execution engine.
- Storytelling directives are not fully wired to room prop placement.
- UI/prop foundry is procedural VisualDNA, not FLUX.
- Visual scores can PASS on occupancy heuristics; look at stills.
- Report: `reports/VGF2_VISUAL_VERTICAL_SLICE.md`

### Recommended next

Human Visual Review of `vgf2-tideglass-nave`. Highest remaining engineering leverage: identity-preserving pose provider (replace Kontext) and reducing tile-atlas repetition.
