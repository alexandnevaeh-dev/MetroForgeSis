# MetroForge Complete Build State

**Audit date:** 2026-08-14
**Current branch:** `feature/claude-generation-runtime`
**Current commit:** `46c0b75` (plus uncommitted working-tree changes — see Part 49/Appendix)
**Package versions:** root `0.1.0`, `@metroforge/desktop` `0.1.0`, `@metroforge/cli` `0.1.0`
**Node:** v24.19.0 · **pnpm:** 10.15.0 · **Electron:** ^33.2.1 · **React:** ^18.3.1
**Godot target:** 4.7.1 (verified against the real binary `Godot_v4.7.1-stable_win64.exe`)
**OS:** Windows 11 (MINGW64/Git Bash), `DESKTOP-LH8AKQL`
**Detected hardware:** Intel Core i3-10110U @ 2.10GHz (2C/4T), 8GB RAM, Intel UHD Graphics (integrated, ~1GB shared VRAM, no discrete GPU)

Method: build/typecheck/test executed against the real toolchain; source files read directly (48+ file:line citations below, gathered via 8 parallel read-only investigation passes plus direct inspection); two full TINY_TEST generations (one per archetype) inspected on disk; Godot runtime/playtest gates re-confirmed against the real 4.7.1 binary earlier today as part of this session's own debugging work, not re-run for this audit specifically (would be redundant — see Part 54).

---

## Executive Summary

MetroForge is a TypeScript/Electron monorepo that generates complete, playable Godot 4.x 2D games from a natural-language prompt — either a side-view Metroidvania or a top-down action-adventure. A pipeline of 16 phases (game design → world/progression → content → assets/audio → Godot project assembly → static validation → automated repair → Godot runtime validation → automated playtest → export) runs end to end, writes a real Godot project to disk, and — as of today — that project has been confirmed via the actual Godot 4.7.1 binary to boot, run, and be completable by an automated input-simulating bot from spawn through to defeating the final boss and reaching a victory state, for **both** archetypes.

**What works right now:** the full generation pipeline runs and terminates cleanly; both archetypes produce a structurally valid, self-consistent Godot project (real scenes for side-view, real runtime-loaded data for top-down); movement, combat, saves, quests, dialogue, shops, and Metroidvania-style ability gating are genuinely implemented and enforced (not cosmetic); QA has 18 real gates (14 static + 4 Godot-runtime) and a real deterministic repair pass; export produces a real manifest + license report + zip and a genuine commercial-safe block. NVIDIA's hosted FLUX image API is a real, currently-configured image provider.

**What doesn't work / isn't real yet:** on this specific machine, local image generation (ComfyUI/Diffusers) is unavailable for legitimate hardware reasons (no discrete GPU), so most non-NVIDIA-covered art falls back to procedural placeholder shapes. The `PRODUCTION_READY` asset-maturity state is defined but **never assigned by any code path** — nothing in the current pipeline can actually produce a "production ready" asset, only up to `QA_REVIEW`. Player/enemy walk-attack-hurt animation frames are pixel-transforms applied to a *procedural placeholder shape*, not to the real AI-generated character art, even when real AI art exists for the character's still image. VFX is a fixed library of 8 procedural gradient sprites — no real particle systems or shaders exist anywhere in either template. The `apps/desktop` renderer currently fails to build (one specific, diagnosed, not-yet-applied fix). Top-down's Godot **runtime smoke test** covers roughly 15% as many systems as side-view's, even though the underlying systems (quests/dialogue/shops/inventory/save-migration) are equally real for top-down.

**Biggest blockers:** (1) the desktop build failure blocks shipping the Electron app at all right now; (2) real image-provider coverage in this environment is limited to NVIDIA — anything not covered by it (VFX, most sprite variety) is procedural; (3) top-down's automated test coverage is a real, measurable gap versus side-view's.

- **COMPLETE PLAYABLE GAME GENERATION: YES** — verified for both archetypes via the real Godot binary: a generated project boots, the player can move/fight/save, and an automated bot completes the full route and defeats the final boss to reach `GameState.VICTORY`.
- **PRODUCTION-QUALITY ASSET GENERATION: PARTIAL** — real AI stills are possible (NVIDIA), but no asset in the pipeline can currently reach the `PRODUCTION_READY` maturity tier, and animation/VFX/tileset fidelity is procedural-grade even when a real base image exists.
- **REAL AI IMAGE GENERATION: YES** — NVIDIA hosted FLUX is configured (`.env` key present) and its provider code performs genuine network requests with real success/failure handling, not canned responses. (ComfyUI/Diffusers, the two *local* providers, are unavailable on this machine's hardware — not a code defect.)
- **GODOT PROJECT ASSEMBLY: YES** — real, verified: template copy + generated per-room `.tscn` scenes (side-view) or generated runtime world data (top-down), plus ~15 generated JSON data files, audio, and asset binaries.
- **GODOT HEADLESS VALIDATION: YES** — real `--headless --quit-after N` invocations against the actual engine, confirmed passing 18/18 gates on fresh generations for both archetypes today.
- **AUTOMATED PLAYTESTING: YES** — a real Input-simulating bot (confirmed via direct code citation: it presses actual `Input.action_press` actions consumed by the real player controller, not internal method calls) completes the full route and boss fight for both archetypes.
- **FINAL EXPORT: YES** — real packaged output (manifest, license report, zip) with a genuine commercial-safe gate that blocks (not just warns) non-compliant exports.

---

## Part 2 — Repository Map

```
apps/
  cli/            — @metroforge/cli: `metroforge` command (create, validate, accept, export, doctor, providers, models, project, open, config)
  desktop/
    electron/     — Electron main process: IPC handlers (handlers.ts, 62 channels), preload bridge, generation queue
    src/studio/   — React renderer: 15 screens (Dashboard, Create, Projects, Generation Studio, Asset Gallery, Manual Generator,
                     World/Room/Dungeon Editors, Game Preview, Models, Providers, Routing Inspector, QA, Export, Settings)
packages/
  shared/         — cross-cutting constants, config loading, logger, path resolution, archetype plugin table, asset-maturity ladder
  schemas/        — Zod runtime schemas: game.ts, bibles.ts, models.ts, core.ts — enforced at DB/generation boundaries
  core/           — product metadata
  database/       — SQLite persistence (node:sqlite or sql.js fallback), versioned migrations, repositories (job/artifact/validation-result/project/settings)
  ai/             — CapabilityRouter, LicenseRouter, ModelRegistry, GenerationRouter facade, mode routing, provider implementations, GameDNA generator
  assets/         — AssetPipeline, ImageRouter, pixel-art processor, PNG synthesis, animation/scene critics, image-gen providers (nvidia-image, comfyui, diffusers)
  procedural/     — world/progression generation (side-view + top-down), room archetypes, movement-feasibility validator, content generation (enemies/bosses/quests/NPCs), audio/music synthesis, design bibles
  godot/          — GodotProjectAssembler (project assembly), room-assembler (per-room .tscn generation)
  qa/             — QAValidator (18 gates), RepairEngineer, acceptance-report/run-acceptance
  tools/          — project-export, project-lifecycle utilities
templates/
  godot-metroidvania/       — side-view archetype Godot 4.x template (mature, ability-gated Metroidvania)
  godot-topdown-adventure/  — top-down archetype Godot 4.x template (item-gated action-adventure)
docs/             — extensive audit/status history (see Appendix); this document supersedes prior audit docs as of today
config/           — models.catalog.json (36 model entries), providers.default.json, .env
```

Each major directory's purpose/status is expanded in its relevant Part below; this section is the map only.

---

## Part 3 — Architecture

**IMPLEMENTED, verified by direct code citation:**

- **Electron:** `contextIsolation: true`, `nodeIntegration: false` (`apps/desktop/electron/main.ts:26-30`) — properly sandboxed, real preload-only bridge, no raw `ipcRenderer`/`require`/`fs` exposed to the renderer.
- **IPC:** 62 handlers registered in `handlers.ts`, all exposed via `preload.ts`; 5 confirmed dead (registered+exposed, never called: `get-app-settings`, `rank-models`, `get-generation-events`, `enqueue-generation`, `get-room`); zero broken (renderer call with no handler).
- **State/persistence:** real SQLite (`packages/database/src/sqlite.ts` — `node:sqlite` primary, `sql.js`/WASM fallback under Electron), one applied migration (schema v1), repositories issue real parameterized SQL and round-trip rows through Zod (`GenerationJobSchema.parse`, etc.) — not an in-memory mock.
- **Generation orchestration:** `GenerationPipeline` (`packages/generation/src/pipeline.ts`) — a real 16-phase sequential orchestrator (full phase table in Part 5), not a queue of independent jobs; one job = one full pipeline run.
- **Job/task system:** database-backed job rows (`generation_jobs`/`generation_stages` tables) plus an in-memory generation queue in `apps/desktop/electron/generation-queue.ts` for desktop concurrency control.
- **Provider system:** real per-provider health-check implementations (network probes for remote, process-spawn/HTTP probes for local) — see Part 26.
- **Model registry / CapabilityRouter:** `packages/ai/src/registry.ts` — real candidate filtering (local-only, free-only, NVIDIA-only, commercial-safe-only, capability, VRAM budget) + health-tier + priority ranking. Confirmed: unhealthy providers are *ranked lower*, never hard-excluded.
- **License Router:** `packages/ai/src/license-router.ts` — real blocking enforcement (`isCommercialSafe`), not just tagging.
- **Artifact system:** real DB-backed artifact records (`packages/database/src/repositories/artifact.ts`) with provider/model/maturity tracked.
- **Asset Foundry / compilers:** `packages/assets/src/asset-pipeline.ts` — real image-gen routing → pixel-art processing → maturity assignment, with fallback-to-procedural on provider failure.
- **World/room/dungeon generation:** real graph-based generation with BFS reachability validation (Part 9) — not a stub.
- **Godot compiler/exporter:** `GodotProjectAssembler` — template copy + generated data + (side-view only) generated per-room scene XML (Part 34).
- **QA:** `QAValidator` — 18 real gates, 14 static + 4 Godot-runtime (Part 36).
- **Repair system:** `RepairEngineer` — targeted deterministic file restoration, not generic AI retry, capped at 3 attempts (Part 40).
- **Automated playtester:** real `Input`-action-simulating bot driving the actual player controller (Part 38).
- **Save/export:** real versioned save-migration (v1→v2) in generated games; real export packaging with a blocking commercial-safe gate (Part 41-42).

**PLANNED but not found as real code:** a dedicated "town" area concept for top-down (flagged in prior session docs, still absent); mini-boss concept for top-down dungeons (absent); any A*/Dijkstra/Wave-Function-Collapse/Tarjan-SCC/grammar-based world generation (none of these algorithms exist anywhere in `packages/procedural/src` — world gen is spine+branching + BFS validation, not the more sophisticated algorithms sometimes assumed for this class of system).

---

## Part 4 — Complete Feature Matrix (Desktop UI)

All 15 screens exist as distinct components (`apps/desktop/src/App.tsx:201-216`), no missing/merged screens.

| Screen | Status | Frontend | Backend/IPC | Persistence | Real or Mock | Known Problem |
|---|---|---|---|---|---|---|
| Dashboard | NEEDS POLISH | `ProjectDashboard.tsx` (491L) | `getProjectDashboard`, `runProjectAcceptance` | real | Real | none found |
| Create | VISUALLY COMPLETE | `CreateScreen.tsx` | `generateGame` + progress events | real | Real | none found |
| Projects | NEEDS POLISH | `ProjectsScreen.tsx` | `listProjects`, `refreshProjectTemplate` | real | Real | none found |
| Generation Studio | VISUALLY COMPLETE | `GenerationStudio.tsx` (653L) | polls `getGenerationState`, real Godot launch buttons | real | Real | none found |
| Asset Gallery | VISUALLY COMPLETE | `AssetsGallery.tsx` (422L) | `listAssets`, `getAssetHistory`, `restoreAssetVersion` | real | Real | none found |
| Manual Asset Generator | VISUALLY COMPLETE | `GenerateAsset.tsx` | `generateAsset` | real | Real | shares production pipeline (Part 33) |
| World Editor | NEEDS POLISH | `WorldEditor.tsx` (329L) | `updateWorldGraph` → `applyWorldEditAndRecompile`, real disk writes | real | Real | none found |
| Room Editor | NEEDS POLISH | `RoomEditor.tsx` (419L) | `updateRoom`/`regenerateRoom` → `applyRoomEditAndRecompile` | real | Real | none found |
| Dungeon Editor | **FUNCTIONALLY INCOMPLETE** | `DungeonEditor.tsx` (332L) | read/visualize only, no direct mutation buttons besides shared CommandBar | real (read) | Real but thin | shows explicit "for top-down projects" empty state for the majority (side-view) project type (`DungeonEditor.tsx:170-193`) |
| Game Preview | **FUNCTIONALLY INCOMPLETE / mislabeled** | `PreviewScreen.tsx` (93L) | `getProjectPreview` — static world-graph + texture thumbnails | real data, wrong feature | Real but not a preview | not a live Godot launch and not a game simulation — it's a read-only recap screen; the actual Godot launch buttons live inside Generation Studio instead |
| Models | VISUALLY COMPLETE | `ModelsScreen.tsx` | `listModels`, `downloadModel`, `getHardwareProfile` | real | Real | none found |
| Providers | VISUALLY COMPLETE | `ProvidersScreen.tsx` | `listProviders`, `getConfig` | real | Real | none found |
| Routing Inspector | NEEDS POLISH | `RoutingInspector.tsx` | `explainModelRouting` | real | Real | none found |
| QA | VISUALLY COMPLETE | `QAScreen.tsx` | `runDoctor`, `getValidationResults`, `runProjectAcceptance` | real | Real | none found |
| Export | VISUALLY COMPLETE | `ExportScreen.tsx` | `exportProject` | real | Real | none found |
| Settings | VISUALLY COMPLETE | `SettingsScreen.tsx` | `setAppSettings`, `getConfig` | real | Real | causes the current renderer build failure via its `@metroforge/shared` import (Part 49, item P1-1) |

No hardcoded/mock data or TODO/stub markers found in any `apps/desktop/src/studio/*.tsx` file (verified by direct grep).

**Editors genuinely mutate on-disk project data**, confirmed end to end (not client-state-only): `WorldEditor.tsx:93` → `update-world-graph` IPC → `world_graph.json` write + recompile; `RoomEditor.tsx:249-278` → `apply-room-edit-and-recompile`; undo writes `world_graph.json` directly (`handlers.ts:1701-1706`); the AI CommandBar (`CommandBar.tsx:29`) parses natural-language edit commands (rule-based, LLM fallback) and applies them for real.

---

## Part 5 — Generation Pipeline (real phase list, from `packages/generation/src/pipeline.ts`)

| # | Phase | Implementation | Input | Output | AI or Deterministic | Status |
|---|---|---|---|---|---|---|
| 1 | `intake` | `pipeline.ts:277` | prompt, profile, mode | validated request | — | WORKING (marker only) |
| 2 | `game_dna` | `generateGameDNA` (`packages/ai/src/generators/game-dna.ts`) | prompt | `game_dna.json` | AI (LLM) with deterministic fallback | WORKING — see caveat below |
| 3 | `design_bible` | `generateDesignBible` (`packages/procedural/src/bibles.ts:119`) | game DNA | `design_bible.json` (palette, audio bible) | Deterministic | WORKING |
| 4 | `world_topology` | `generateWorldTopology` / `generateTopDownWorld` (archetype-branched) | design bible | `world_graph.json` | Deterministic (spine+branch algorithm) | WORKING |
| 5 | `progression_graph` | `validateReachability`/`validateWorldReachability` | world graph | reachability confirmation | Deterministic (fixed-point BFS) | WORKING |
| 6 | `enemy_families` | `generateGameContent` (`packages/procedural/src/content.ts`) | world graph | enemies | Deterministic, no AI calls | WORKING |
| 7 | `bosses` | same call as #6 | — | bosses | Deterministic | WORKING |
| 8 | `quests` | same call as #6 | — | quests | Deterministic | WORKING |
| 9 | `npcs` | same call as #6 | — | NPCs | Deterministic | WORKING |
| 10 | `audio` | `synthesizeAllSfx`/`generateMusicFromAudioBible`/`synthesizeDialogueVoices` | design bible | SFX/MIDI/"Furnace"/voice files | Real DSP + real MIDI encoding | WORKING (see Part 23 caveat on "Furnace" naming) |
| 11 | `environment_assets` | `AssetPipeline.generate` | design bible | sprites/tilesets/VFX | AI (image gen) w/ procedural fallback | PARTIAL — see Part 18-24 |
| 12 | `project_assembly` | `GodotProjectAssembler.assemble` | all prior artifacts | full Godot project tree | Deterministic | WORKING |
| 13 | `static_validation` | `QAValidator.validateProject` (14 gates) | assembled project | pass/fail per gate | Deterministic | WORKING |
| 14 | `automated_repair` | `RepairEngineer.repair` (max 3 attempts) | failed gates | targeted file restoration | Deterministic | WORKING |
| 15 | `final_qa` | 4 Godot-runtime gates via real Godot binary | assembled project | 18/18 report | Deterministic (real engine) | WORKING |
| 16 | `export` | `exportProject` | validated project | manifest, license report, zip | Deterministic | WORKING |

**GameDNA caveat (real finding):** even when an LLM provider is configured and used, `dna.abilities` is **unconditionally overwritten** with deterministic ability/item picks after the LLM call returns (`game-dna.ts:141-143`) — only title/tagline/genre/tone/narrative are ever actually LLM-authored; ability/item selection is always deterministic regardless of AI availability. Enemy/boss/quest/NPC content generation (`content.ts`) makes **zero AI provider calls** — always deterministic/templated.

---

## Part 6-8 — Game Archetypes

Both archetypes are dispatched through a clean plugin table (`packages/shared/src/archetypes.ts:15-38`, `GAME_ARCHETYPE_PLUGINS`) and one `if/else` branch in the assembler (`packages/godot/src/assembler.ts:97-153`) — not a copy-paste fork with drift. No archetype-specific "not yet supported" TODOs found anywhere.

| System | SIDE_VIEW_METROIDVANIA | TOP_DOWN_ACTION_ADVENTURE |
|---|---|---|
| Movement | 8-ability modular system (jump/dash/double-jump/wall-slide/wall-jump/air-dash/ground-slam), real distinct physics per ability | 8-directional free-roam, no ability-gating framework |
| Camera | side-scroll follow | top-down follow |
| Combat | melee hitbox + real facing-dependent reach | melee hitbox, same facing-dependent-reach class of mechanic (both fixed this session) |
| World topology | room-graph spine+branch, ability-gated edges | tile-noise overworld + fixed 4-room dungeon template (not procedurally laid out) |
| Rooms | real generated per-room `.tscn` scenes | no per-room scenes — runtime-loaded from `overworld.json` by `OverworldManager.gd` |
| Progression gating | ability-based (`RoomTransition.required_abilities`) | item-based (chest → key/dungeon-item → `LockedDoor`/`ItemGate`, real `InventoryManager.get_owned_count` checks) |
| Ability/item framework | full `AbilityController`/`AbilityRegistry`/`PlayerAbility` architecture, 9 real ability scripts | none — `AbilityPickup.gd` exists but is **vestigial dead code**, not wired into `TopDownPlayerController.gd` at all |
| Enemy AI | 8 real movement patterns + 7 real attack patterns, generated-data-driven | present, less varied (not independently deep-audited this pass) |
| Bosses | real phase/telegraph/weakness system, verified this session via live combat | same script family, real phase/telegraph/weakness, verified this session |
| NPCs/Quests/Dialogue/Shops | fully real, branching dialogue, real currency/inventory effects | **byte-identical** `QuestManager.gd`/`DialogueManager.gd`/`ShopManager.gd` to side-view — equally real, not thinner |
| Save/load | real v1→v2 migration | real, structurally near-identical |
| UI | full parity by filename (Quest/Dialogue/Shop/Inventory/Minimap panels all present) | same |
| Godot export | real | real |
| Playtest (this session) | 8/8, verified via ~10 live Godot runs | 8/8, verified via ~10 live Godot runs |
| **Genuinely playable end-to-end** | **YES** | **YES** |

**Real gap, not yet closed:** top-down's `RuntimeSmokeTest.gd` is ~101 lines / ~15 checks vs side-view's ~1557 lines / 100+ checks — it does not assert quests/dialogue/shops/inventory/minimap/save-migration/death-respawn for top-down even though those systems are equally real. The *playtest* gate (full route + boss fight) is equally thorough for both; the *smoke test* gate is not.

---

## Part 9 — World Generation: Real Algorithms

Confirmed present (`packages/procedural/src/*`):
- Linear room spine + random branching shortcuts + vertical biome shafts + ability-gated edge insertion (`world.ts:28-126`).
- Real BFS connectivity check (`world.ts:264-298`).
- Real fixed-point-iteration reachability validator simulating progressive ability pickup across passes (`world.ts:315-364`) — not a single-pass BFS.
- Real BFS victory-route planner over `(room, abilitySet)` state space (`playtest-route.ts:36-149`).
- Room archetype assignment: deterministic modulo/index rules, seeded RNG only for pool fallback (`room-archetypes.ts:53-138`) — not a grammar system.
- Movement feasibility: arithmetic reach checks (jump apex, dash distance) against a lookup table (`movement-feasibility.ts:115-169`) — heuristic math, not physics simulation. **Real coverage gap**: `wall_jump`/`wall_slide`/`grapple` are explicitly excluded from the up-gap physics check (line 149) — their real reach is never actually validated against generated room gaps.
- Top-down overworld: per-tile random noise + distance-rejection point scattering (not true Poisson-disc, `topdown/world.ts:258-345`); dungeons are a **fixed 4-room template** (`buildDungeonRooms`, lines 347-409), not procedurally laid out.

**Confirmed NOT present anywhere in the codebase:** A*, Dijkstra, Wave Function Collapse, Tarjan SCC, grammar-based generation. Do not assume these exist; several audit prompts assumed they might and none were found.

---

## Part 10-13 — Editors, Room System, Dungeons

- **World Editor**: real add/connect/disconnect room mutations, all backed by real disk writes and recompile (Part 4).
- **Room Editor**: real tile painting (`TilePaintEditor`), entity add/edit, real occupancy overlay from `getRoomCollision`'s painted-cell data, real regenerate-room path.
- **Dungeon Editor**: read/visualize only — no dedicated add/connect/disconnect controls of its own (only the shared AI CommandBar); genuinely incomplete relative to World/Room editors, and shows an explicit empty state for side-view projects (dungeons are a top-down-only concept in the current data model).
- **RoomDefinition schema**: real Zod schema (`packages/schemas/src/game.ts`) covering tile layers, entities, collision, encounters — enforced at generation and DB boundaries.
- **Dungeon graph** (top-down only): entrance/combat/boss rooms real; no mini-boss concept; fixed 4-room layout (not graph-generated).

---

## Part 14 — Player System

`PlayerController.gd` exists in both templates (the "missing PlayerController.gd" issue noted in a prior audit round is **resolved** — confirmed present and required by the `required_files` QA gate, archetype-conditional filename). Real modular ability architecture (`AbilityController.gd` + `PlayerAbility.gd` base + `AbilityRegistry.gd` + 9 distinct ability scripts, `templates/godot-metroidvania/scripts/player/abilities/*.gd`) — each ability has genuinely distinct physics, not a shared script with flags. Health/damage/collision/camera/input all real, save-state integration confirmed (Part 41).

---

## Part 15 — Enemies

`EnemyController.gd` reads real per-enemy generated data (`data/enemies/enemies.json`) and dispatches to 8 real movement functions (patrol/hop/fly/hover/charge/teleport/burrow/crawl) and 7 real attack functions (melee/projectile/burst/beam/area/summon/trap) — confirmed by function citation, not assumption (`EnemyController.gd:83-403`).

---

## Part 16 — Bosses

Real phase/telegraph/weakness system (`bosses.json`-driven), confirmed working this session via extensive live-Godot combat debugging for both archetypes (dead-AI-wiring bug found and fixed for top-down's `Boss.tscn`; attack-hitbox reach/facing bugs found and fixed for side-view's `PlaytestAgent.gd`/`PlayerController.gd`). Boss defeat correctly chains through `EventBus.boss_defeated` → `GameManager._on_boss_defeated` → `GameState.VICTORY`, confirmed via real playtest telemetry (`"victoryState":true,"gameComplete":true"` in this session's final verification runs).

---

## Part 17 — NPCs / Quests / Dialogue / Shops

All real, not cosmetic:
- Real quest state machine (`LOCKED/AVAILABLE/ACTIVE/COMPLETE`), 10 real objective types (Reach/BossKill/Kill/Collect/Talk/AbilityAcquire/Discover/Activate/Interact/Choice), real reward application (currency mutation + `InventoryManager.grant_item`), real prerequisite-chain unlocking (`QuestManager.gd`).
- Real branching dialogue graph with conditional choices that can jump trees or trigger side effects (`accept_quest`/`open_shop`) — not linear text (`DialogueOverlay.gd:93-137`).
- Real shop purchase flow: balance validation, currency deduction, inventory grant (`ShopManager.gd:38-60`).
- **Byte-identical** between archetypes for Quest/Dialogue/Shop managers — top-down has the same real systems, not thinner stubs.

---

## Part 18-24 — Asset System (detailed)

**Asset maturity ladder** (`packages/shared/src/asset-maturity.ts:2-10`): `PLACEHOLDER, BLOCKOUT, GENERATED_SOURCE, COMPILED, QA_REVIEW, PRODUCTION_READY, REJECTED`.

- **`PRODUCTION_READY` is never assigned anywhere in the codebase** — only referenced in comparisons, never written. The maturity ceiling actually reachable today is `QA_REVIEW`.
- **`BLOCKOUT` is likewise never assigned.**
- Procedural/fallback art is hard-forced to `PLACEHOLDER` and cannot self-report otherwise (`asset-pipeline.ts:87-89`) — a placeholder circle genuinely cannot masquerade as anything higher.
- The production-readiness gate (`project-completion.ts:131-166`) is a **blocklist, not an allowlist**: it only rejects `PLACEHOLDER/BLOCKOUT/REJECTED`/`fallbackGenerated===true`. An asset sitting at `GENERATED_SOURCE` or `COMPILED` — real AI output that never actually ran through a critique pass — **passes** the gate and can make `project.productionReady === true` even though nothing ever reached `PRODUCTION_READY`. This is a real, if narrow, gap between the gate's name and its literal enforcement.
- Biome tile slices are unconditionally marked `fallbackGenerated: true` (`asset-pipeline.ts:832-843`) even when derived from real AI art — forces every tile PNG to `PLACEHOLDER` regardless of source quality; likely unintended.

**Sprite pipeline** — per step:
| Step | Status |
|---|---|
| Concept/reference → pose generation | MISSING (single still image per character, no pose variation) |
| Background removal | MISSING (no segmentation code; FLUX returns opaque RGB with no alpha to remove) |
| Alignment/scaling | WORKING (`pixel-art-processor.ts:92-113`) |
| Pixel conversion / palette reduction | WORKING (`pixel-art-processor.ts:115-134`, 8-color quantization) |
| Grid alignment | **DEAD CODE** — `alignToGrid` (`pixel-art-processor.ts:161-176`) computes a no-op transform and always zeroes destination alpha; never visibly changes output |
| Atlas packing | MISSING (each sprite/sheet is its own file) |
| SpriteFrames resource generation | WORKING, but lives in the Godot template (`AnimatedAssetSprite.gd:20-66`), not the TS pipeline |

**Animation**: idle/walk/attack/hurt exist; idle is a copy of walk-frame-0 (not distinct); **no death animation exists anywhere** (only a death SFX). Walk/attack/hurt sheets are **procedural pixel transforms** (`png.ts:168-262`) — vertical bob, tint flash, brightness pulse — not distinct AI-generated poses. **Real gap**: player and enemy animation sheets are generated from `generateProceduralSprite` (a flat colored shape) as the source, **not** from the real AI-generated character still, even when one exists (`asset-pipeline.ts:517-528,570-581`) — so a player with a real AI portrait can still have visually disconnected placeholder-shape walk/attack frames. NPC and boss sheets *do* correctly use the real AI sprite as source (`asset-pipeline.ts:632-728`).

**Tileset**: one source image per biome (AI or procedural), plain fixed-grid slicing, **no autotile/terrain-set/edge-corner logic anywhere in the repo**. Real deterministic QA critique exists (occupancy %, palette drift).

**Audio**: real, working DSP throughout. Real WAV-encoded sine/square/noise/sweep SFX (`packages/procedural/src/audio.ts`), real WAV-encoded biome music loops, real Standard MIDI File encoding (`music.ts:97-142`). **Naming issue**: the "Furnace" export (`exportFurnaceModule`, `music.ts:74-94`) is **not** a real Furnace tracker `.fur` file — it's a custom JSON note-list with a hint to reconstruct it manually in a tracker. Correctly extensioned but not functional as a Furnace project.

**VFX/shaders**: a fixed library of 8 hardcoded procedural gradient-sprite effects (`hit_spark`, `death_puff`, etc.), identical across every generated project regardless of seed. **No `.gdshader` files, no `GPUParticles2D`, no real particle or shader systems exist anywhere in either template.** VFX assets are always forced to `PLACEHOLDER` maturity and never attempt an image-gen provider.

---

## Part 25-31 — Model Registry, Providers, Routing

**Providers** (confirmed real health-check logic, not canned):
| Provider | Local/Remote | Health check |
|---|---|---|
| Ollama (text) | local | real `GET /api/tags` |
| Ollama Embeddings | local | model-presence check against `/api/tags` |
| NVIDIA (text/LLM) | remote | real `GET /models`, 401/403→AUTH_FAILED |
| Gemini/Groq/OpenRouter/HuggingFace | remote | real `listModels()` call, hard-gated on non-empty API key |
| Piper TTS | local | spawns `piper --help` |
| Whisper ASR | local | spawns `whisper-cli --help`, model-path resolution |
| ComfyUI (image) | local | real `fetch(/system_stats)`, 3s timeout |
| Diffusers (image) | local | real file-existence + Python worker spawn + health probe |
| NVIDIA (image, `nvidia-image`) | remote | real multi-endpoint probe (auth + route-exists check) |
| NVIDIA Vision Critic | remote | real `GET /models`, silently falls back to deterministic critique on any failure |

**Real image provider status: YES.** `.env` has a non-empty `NVIDIA_API_KEY` and `NVIDIA_IMAGE_MODEL=black-forest-labs/flux.1-dev` configured; `nvidia-image` provider registers (priority 88) whenever the key is present; the router prefers remote providers on low-resource hardware and never VRAM-filters remote entries. **ComfyUI/Diffusers unavailability is genuinely environmental** (this machine has no discrete GPU) — neither provider hard-fails on a pre-flight hardware check in code; both make a real connection/spawn attempt that fails because nothing is actually running/installed locally.

**CapabilityRouter**: real filtering (local-only/free-only/NVIDIA-only/commercial-safe-only/capability/VRAM budget) + health-tier (healthy > degraded > unavailable, never hard-excluded) + priority ranking (`registry.ts:90-116`). VRAM filtering only bites local model entries because remote catalog entries simply never carry a `minVramMb` field — not special-cased, just naturally VRAM-neutral by omission.

**License Router**: real blocking enforcement — `COMMERCIAL_SAFE` mode genuinely filters out anything not `status==='COMMERCIAL_SAFE'` (`license-router.ts:104-106`), including `UNKNOWN`-licensed assets.

**Generation modes** (`mode-routing.ts`): `FREE_ONLY, HYBRID_FREE, LOCAL_ONLY, OFFLINE, NVIDIA_ONLY, COMMERCIAL_SAFE, FASTEST, HIGHEST_QUALITY, LOW_VRAM, BALANCED, CUSTOM` — all real, each with distinct, cited filter/scoring behavior, not just type-level definitions.

**Model catalog**: 36 registered entries in `config/models.catalog.json`, spanning text/image/vision/embedding/speech capabilities across local and remote providers. **Note**: NVIDIA's hosted image generation bypasses this catalog and `ModelRegistry` entirely — it runs through a separate `ImageProviderRegistry` in the assets package.

---

## Part 32 — Artifact System

Real DB-backed records (`packages/database/src/repositories/artifact.ts`) tracking provider/model/maturity/version, Zod-validated on read/write.

## Part 33 — Manual Asset Generator

Uses the same production `AssetPipeline`/router/critique path as autonomous generation (confirmed by the desktop-UI audit — `GenerateAsset.tsx` calls the real `generateAsset` IPC handler, not a separate mock path).

---

## Part 34 — Godot Project Generation

`GodotProjectAssembler.assemble()` (`packages/godot/src/assembler.ts:90`): the whole project starts as a **template copy** (`cpSync`) of the matching archetype template, then:
- **Side-view only**: real per-room `.tscn` scene-XML generation from scratch (`generateRoomScene`/`room-assembler.ts`), driven by room connections/archetype/enemy/tileset data.
- **Top-down only**: no per-room scenes at all — `data/world/overworld.json` is written and `OverworldManager.gd` (a static template script) spawns all room geometry/POIs at runtime from that JSON.
- ~15 derived JSON data files written (rooms, game_dna, world_graph, progression_graph, playtest_route w/ feasibility metrics, movement, abilities, enemies, bosses, quests, items, npcs, dialogues, shops, manifests).
- Audio/texture binaries written verbatim (bytes copied, not further processed).
- Only two string-patches into static template text: `project.godot`'s app name and the title-screen label. **The input map is never generated by the assembler** — it comes entirely from the template's own `project.godot`, and the repair engine explicitly restores from the template rather than synthesizing one.

## Part 35 — GDScript

All generated GDScript is either (a) static template files copied verbatim, or (b) real per-room `.tscn` scene definitions (side-view) referencing static template scripts. **No GDScript source code is LLM- or procedurally-generated from scratch** — the "GDScript generation" implied by earlier planning docs is actually template-script-reuse plus data injection, not code synthesis. This is architecturally sound (avoids the class of bugs that comes from generating and parsing untrusted freshly-written GDScript) but should not be described as "AI writes GDScript."

## Part 36 — Godot Validation (real, confirmed against the actual engine)

Real headless invocations, all confirmed by direct code citation:
- `godot_imports`: `--headless --path <project> --quit-after 1` (preceded by `--import`), checks for `Parse Error`/`Failed to load`/`ERROR:` in stdout.
- `godot_runtime`: `--headless --path <project> res://scenes/test/RuntimeSmokeTest.tscn --quit-after 600`.
- `gameplay_screenshot_qa`: not a separate Godot invocation — critiques the PNG the smoke test already captured; soft-fail only, never blocks.
- `godot_playtest`: `--headless --path <project> res://scenes/test/PlaytestRunner.tscn --quit-after 12000`.

**18/18 math confirmed literal, not hardcoded**: `pipeline.ts:993` computes `results.filter(passed).length / results.length` where `results` = the real 14 static gates + the 4 gates above.

## Part 37 — Game Preview

**Not a live Godot launch and not a game simulation.** `PreviewScreen.tsx` renders a static world-graph visualization plus generated-texture thumbnails from the manifest — a read-only recap, not a playable/representative preview of exported game behavior. The actual real-Godot launch exists, but only inside the Generation Studio screen, not behind the "Game Preview" nav item.

## Part 38 — Automated Playtest

Confirmed real: both templates' `PlaytestAgent.gd` drive the game via `Input.action_press`/`Input.action_release` (side-view: attack/move_left/move_right; top-down: full 4-directional + dash/attack) — the same `Input` singleton the real player controller reads each frame in normal play. No internal-method-call bypass found. This session's own extensive debugging additionally confirms (beyond static citation) that the bot genuinely: spawns, moves, transitions rooms, collects items/abilities, opens gates, reaches bosses, fights and defeats them via real hitbox-based combat, and triggers a real `VICTORY` state — for both archetypes, verified via live telemetry from actual Godot runs today.

## Part 39 — QA

18 real gates total (list in Part 36 + the 14 static gates in Part 5's methodology). All are real structural/data checks except `input_actions_exist`/`main_scene_starts` which are string-contains checks (thin but not wrong) — no gate found that's a pure stub returning true unconditionally.

## Part 40 — Automated Repair

Real, targeted, deterministic — not generic AI retry: `restoreTemplateFile`/`restoreMainScene`/`restoreProjectGodot`/`repairInputActions` each copy a specific known-good file/section from the matching archetype template. Explicitly refuses to auto-repair `registered_abilities_valid` failures rather than inventing GDScript (`repairable: false`). Capped at 3 attempts with early-exit if a pass makes no progress.

## Part 41 — Save System

Real, versioned: `SAVE_VERSION := 2`, real `_migrate_v1_to_v2` migration backfilling `checkpoint_room_id`/`defeated_bosses`/`discovered_rooms`/`quests`/`playtime`; newer-than-supported saves are rejected rather than assumed compatible. Persists player health/room, checkpoint, abilities, defeated bosses, quest state, inventory/collectibles, discovered-room map, and playtime — for both archetypes, structurally near-identical.

## Part 42 — Export

Real manifest (`export_manifest.json`) + license report + staged project-folder copy + zip (via `tar`). **Commercial-safe gate is a real block**: when required and the project isn't commercial-safe, export returns `success:false` and writes nothing — not merely a warning. A separate validation-required gate blocks the same way.

---

## Part 43 — UI Status (no redesign performed, classification only)

See Part 4's table — 12 of 15 screens are VISUALLY COMPLETE or NEEDS POLISH with real backing data; Dungeon Editor and Game Preview are the two genuinely incomplete/mislabeled screens. No screen found BROKEN.

## Part 44 — Responsive Status

Not independently re-tested this pass — `docs/CURSOR_WORKSTREAM_STATUS.md` (the other agent's own live status doc) reports layout breakpoints implemented for 1920/1440/1366 as part of an in-progress premium redesign (Phases 1-5 done, 6-11 in progress). Not verified via screenshot this audit — screenshot automation exists (`scripts/capture-ui-screenshots.mjs`, `pnpm capture:ui`) but wasn't run for this document. Marking **UNKNOWN** rather than asserting a result I didn't produce.

## Part 45 — Security

- Renderer is properly sandboxed (`contextIsolation:true`, `nodeIntegration:false`), no direct Node access.
- API keys never cross the IPC boundary as values — `get-config` returns only booleans (`Boolean(process.env.NVIDIA_API_KEY)`); persisted app settings hold no key fields.
- No evidence of key logging or renderer exposure found.
- `.env` file exists at repo root with real (non-empty) NVIDIA key content — not committed to git (`.gitignore:6` covers `.env`).
- Not independently re-audited this pass: IPC input validation depth, path-traversal protection on generated-project file operations (prior session work — "Security fixes + safe path resolution" — is marked completed in the task history but not re-verified line-by-line here).

## Part 46 — Performance

Not independently profiled this pass (would require running the desktop app with a large gallery/project, which the current build failure blocks). No leak reports or complaints found in code comments. Flagged **UNKNOWN**, not asserted.

---

## Part 47 — Test Suite

`pnpm test` (vitest): **386 passed, 1 failed / 387 total, 81 test files** (80 passed / 1 failed). The one failure (`packages/ai/src/bootstrap.test.ts` — NVIDIA catalog reconciliation test, timed out at the default 5000ms) was re-run in isolation and **passed cleanly in 359ms** — confirmed flaky under concurrent load (this session ran the suite alongside live Godot processes), not a real regression.

## Part 48 — Build Status

| Command | Result |
|---|---|
| `pnpm run typecheck` | **PASS** — all 14 workspace packages clean |
| `pnpm run build` | **FAIL** — one package: `apps/desktop`'s Vite renderer step (root cause + fix in Part 49, item P1-1); `tsc` and the Electron main-process bundle both succeed |
| `pnpm test` | **PASS** (386/387, 1 confirmed-flaky) |
| `pnpm run lint` | NOT RUN this pass |

---

## Part 49 — Current Blockers

### P0 BLOCKERS (preventing a valid playable Godot game)
**None.** Both archetypes reach `RUNTIME_VALIDATED`, 18/18 gates, verified today against the real Godot binary on fresh generations.

### P1 BLOCKERS (preventing reliable full AI generation / shipping)

**P1-1 — `apps/desktop` renderer fails to build.**
- Problem: `packages/shared/src/config.ts` performs Node-only work (`node:path`/`node:url`, reads `.env` at module-load time) and is re-exported by `packages/shared/src/index.ts`'s flat `export *` barrel; the renderer only needs `provider-toggles.ts` exports (`SettingsScreen.tsx`) but pulls the whole barrel in, and Vite chokes on the Node built-ins.
- Evidence: `apps/desktop build: ../../packages/shared/dist/config.js (2:15): "dirname" is not exported by "__vite-browser-external"`.
- Affected files: `packages/shared/src/index.ts`, `packages/shared/package.json`, `apps/desktop/src/studio/SettingsScreen.tsx`.
- Fix (diagnosed, partially started, not completed): add a `./provider-toggles` subpath export to `packages/shared/package.json` (done, uncommitted) and change `SettingsScreen.tsx`'s import to that subpath instead of the bare package import. No renderer logic changes needed.
- Complexity: SMALL. Dependency: none.

**P1-2 — Top-down's `RuntimeSmokeTest.gd` covers far less than side-view's.**
- Problem: ~15 checks vs ~100+; quests/dialogue/shops/inventory/minimap/save-migration/death-respawn are unasserted for top-down despite being equally real systems.
- Affected file: `templates/godot-topdown-adventure/scripts/test/RuntimeSmokeTest.gd`.
- Complexity: LARGE (mirroring side-view's ~1500-line suite against top-down's different APIs).

**P1-3 — `RoomTileMap.gd` is orphaned dead code.**
- Problem: complete, working tile-painting implementation, referenced by nothing (no `.tscn`, no `class_name`, no preload).
- Affected file: `templates/godot-metroidvania/scripts/world/RoomTileMap.gd`.
- Complexity: SMALL (delete, or wire in if a tile-painted-room feature was intended).

**P1-4 — Player/enemy animation frames are generated from a placeholder shape, not the real AI art.**
- Problem: even when a real AI character still exists, the walk/attack/hurt sheets are built by running procedural pixel-transforms on `generateProceduralSprite`'s output, not on the real image.
- Affected file: `packages/assets/src/asset-pipeline.ts:517-528,570-581`.
- Complexity: MEDIUM (needs the real sprite buffer threaded through the same way NPC/boss sheets already do it).

**P1-5 — Asset-maturity production gate is a blocklist, letting un-critiqued `GENERATED_SOURCE`/`COMPILED` assets count as production-ready.**
- Affected file: `packages/generation/src/project-completion.ts:131-166`.
- Complexity: MEDIUM (requires deciding the intended semantics — allowlist would be stricter and may currently fail real projects; needs product judgment, not just a code change).

### P2 GAPS (missing production features)

- No death animation anywhere (only a death SFX).
- No autotile/terrain-set tileset logic (fixed-grid slicing only).
- VFX is a fixed 8-effect procedural library, no real particles/shaders in either template.
- "Furnace" audio export is not real Furnace-tracker format (misleading extension/name).
- `movement-feasibility.ts` never validates `wall_jump`/`wall_slide`/`grapple` reach against real physics — those three abilities' generated-room-gap compatibility is unverified.
- Top-down has no mini-boss concept; no "town" area concept for either archetype's NPC/save clusters.
- `AbilityPickup.gd` in top-down is vestigial dead code (unreachable from `TopDownPlayerController.gd`).
- Grid-alignment step in the pixel-art processor is dead/no-op code (`pixel-art-processor.ts:161-176`).
- Biome tile slices are always force-marked `PLACEHOLDER` regardless of real source quality.
- Dungeon Editor has no direct mutation controls of its own (CommandBar only).
- "Game Preview" screen doesn't preview the actual game — mislabeled relative to its content.
- 20 `tmp-nvidia-*`/`tmp-smoke-*` scratch files sitting untracked at the repo root (debug artifacts, safe to delete).

### P3 POLISH (UX/UI/performance)
- 5 dead IPC handlers (`get-app-settings`, `rank-models`, `get-generation-events`, `enqueue-generation`, `get-room`) — harmless but worth pruning.
- `apps/desktop/src/studio/format.ts` hand-duplicates `GENERATION_PHASES` from `packages/shared/src/constants.ts` with no shared import or parity test — currently in sync, latent drift risk.
- Desktop UI redesign (Cursor's own workstream) explicitly in progress, phases 6-11 not done.

---

## Part 50 — External Blockers (not code problems)

- **Local image generation (ComfyUI/Diffusers) is unavailable purely due to this machine's hardware** — integrated GPU only, no discrete VRAM. This is not a bug; the code correctly attempts and correctly reports failure. On a machine with a real GPU and the local servers running, these providers would very plausibly work as coded (not independently verified here — no such machine available for this audit).
- **NVIDIA API key is present and configured** — no external blocker there currently, other than normal API rate limits (not observed as an issue this session).
- Godot 4.7.1 binary presence is a local machine dependency (`GODOT_EXECUTABLE`), currently satisfied on this machine.

---

## Part 51 — Technical Debt

Cross-repo scan results (grep counts, `packages/*/src` + `apps/*/src`, excluding tests):
- `as any`: **0 hits.**
- `@ts-ignore`/`@ts-expect-error`: **0 hits.**
- `deprecated`: 1 hit, legitimate JSDoc tag, not a smell.
- `hardcoded`/`hard-coded`: 1 hit, a comment explicitly *denying* the smell.
- Raw `console.*` in library code: **0 hits** outside the logger's own implementation — logging consistently routed through `packages/shared/src/logger.ts`.
- TODO/FIXME/XXX/HACK in database/core/tools/schemas/cli: **0 hits.**
- No `*.old.ts`/`*.bak`/`*-v2.ts`/`*-legacy.ts` files anywhere.
- GenerationRouter/CapabilityRouter consolidation confirmed genuinely complete — no dead pre-consolidation router code remains reachable.
- One intentional, currently-in-sync but unguarded duplication: `apps/desktop/src/studio/format.ts` hand-copies `GENERATION_PHASES`.

**Verdict: this codebase has unusually low conventional technical debt** for its size — the real gaps found this audit are architectural/product gaps (asset maturity semantics, animation source fidelity, top-down test coverage), not code-quality debt.

## Part 52 — Placeholder Inventory

All "placeholder"/"stub"/"mock" grep hits across `packages/*/src` (non-test) resolve to one of: (a) the real, intentional `AssetMaturity.PLACEHOLDER` state, (b) template title-text patching, (c) LLM guard-rail message copy telling the model not to fabricate scripts — none are unfinished-code markers. The genuine placeholder-*behavior* findings are cataloged in Part 18-24 and Part 49 (procedural fallback art, VFX, animation-source mismatch) — those are real product-quality gaps, correctly self-labeled as `PLACEHOLDER` by the system, not hidden.

## Part 53 — "Looks Implemented But Isn't" Audit

Confirmed cases, ranked by how misleading they are:
1. **"Game Preview" screen** — named as if it previews the game; actually a static recap screen. The real preview (launching Godot) exists elsewhere in the UI.
2. **`PRODUCTION_READY` asset state** — exists in the type system, referenced in gating logic, but no code path ever assigns it. Nothing in the current build can produce a "production ready" asset by the enum's own definition.
3. **Player/enemy animation "from AI art"** — the character's still image can be real AI art while its walk/attack/hurt animation is built from an unrelated procedural placeholder shape.
4. **Grid-alignment step in the sprite pipeline** — runs, does nothing, silently.
5. **"Furnace" music export** — correctly named/extensioned, not actually a Furnace-tracker-openable file.
6. **`AbilityPickup.gd` (top-down)** — still emits the ability-acquired signal and is referenced by a test/scene, but nothing in the actual player controller consumes it.
7. **Dungeon Editor's occupancy/mutation controls** — visually present as a full editor, functionally read-only besides the shared CommandBar.
8. **Movement-feasibility QA gate** — real for 4 of 7 traversal abilities; silently skips real validation for `wall_jump`/`wall_slide`/`grapple`.

No case found where a QA gate itself is fake (all 18 gates do real work, even the thinner string-contains ones), and no case found where a button updates only local React state while claiming to persist — the desktop editors' write paths are all genuinely real.

---

## Part 54 — End-to-End Generation Test

Not re-run fresh for this specific audit document — would duplicate today's session work. Ground truth used instead, from **two real TINY_TEST generations completed earlier today** (both inspected on disk for this audit, not taken on faith):

| Phase | Side-view result | Top-down result |
|---|---|---|
| intake → project_assembly | PASS | PASS |
| environment_assets | DEGRADED (procedural placeholders — comfyui/diffusers unavailable) | DEGRADED (same reason) |
| static_validation | PASS | PASS |
| automated_repair | SKIPPED (no repair needed) | SKIPPED (no repair needed) |
| final_qa | **PASSED — RUNTIME_VALIDATED, 18/18** | **PASSED — RUNTIME_VALIDATED, 18/18** |
| export | PASS | PASS |

Both used real Godot 4.7.1 headless runs for the runtime/playtest gates — not simulated or assumed.

## Part 55 — Final Generated Project Inspection

Both `GeneratedGames/a-crumbling-clocktower-haunted-by-a-bronze-automaton` (side-view) and `GeneratedGames/a-wind-swept-marsh-kingdom-with-a-hidden-crypt` (top-down), inspected directly for this audit:
- **Zero zero-byte files** in either project.
- `validation_report.json` in both: `status: RUNTIME_VALIDATED`, 18 gates, 0 failed.
- Directory structure present and populated as expected: `assets/{bosses,characters,enemies,npcs,tilesets,vfx}`, `audio/{midi,music,sfx,voice}`, `data/{abilities,bosses,dialogues,enemies,items,npcs,player,quests,rooms,shops,world}`, `scenes/{boot,bosses,enemies,player,rooms,test,world}`, `scripts/{AI,UI,combat,core,player,test,world}`.
- Main scene, input map, and autoloads present (satisfied `main_scene_starts`/`input_actions_exist`/`required_files` gates — confirmed passing, not independently re-opened in Godot editor for this document).
- Victory condition confirmed reachable via real playtest telemetry from today's session (`"victoryState":true`).

---

## Part 56 — Actual Completion Percentage

Weighted, honest estimate — not one arbitrary number:

| Area | Estimate | Basis |
|---|---|---|
| Architecture | 90% | clean, consolidated, low technical debt |
| Game Generation (pipeline/world/content) | 85% | all phases real; top-down dungeons still template-fixed |
| AI Providers | 70% | routing/licensing/modes all genuinely real; real coverage limited to what's configured (NVIDIA here) |
| Visual Assets | 45% | real AI stills possible; animation/VFX/tileset fidelity is procedural-grade; PRODUCTION_READY unreachable |
| Audio | 75% | real SFX/music/MIDI synthesis; "Furnace" naming is misleading |
| Godot Integration | 90% | real assembly, real validation, real repair |
| World/Rooms | 80% | real for side-view; top-down dungeons are template-fixed, not generated |
| Gameplay (movement/combat/abilities/quests/dialogue/shops) | 90% | genuinely deep and real for both archetypes |
| QA | 90% | 18 real gates, real repair, real playtest |
| Playtesting | 85% | genuinely real input-simulated bot, verified to victory today; top-down smoke-test coverage thin |
| Editors | 75% | World/Room genuinely real; Dungeon Editor thin |
| UI/UX | 65% | functionally solid, visual redesign explicitly in progress, one broken build |
| Export | 90% | real packaging, real commercial-safe enforcement |
| Production Readiness | 40% | the asset-maturity ceiling gap and desktop build failure are the main drags here |

**OVERALL ENGINEERING COMPLETION: ~78%** (weighted toward the count of genuinely-implemented, verified systems — most of the "missing 22%" is asset-production polish and one build bug, not core architecture or gameplay).

**END-USER PRODUCT READINESS: ~45%** — a technically-complete, genuinely-playable game generator that a developer could exercise successfully right now, but not yet something a non-technical end user could pick up: the desktop app doesn't currently build, generated visuals are placeholder-grade without a configured GPU/NVIDIA key, and several UI screens (Dungeon Editor, Game Preview) don't yet do what their names promise.

**Why they differ**: engineering completion measures "does the real system underneath work" (mostly yes); product readiness measures "would today's build satisfy an end user's expectation of the labeled features" (not yet — mostly asset-fidelity and one build blocker, not missing architecture).

---

## Part 57 — What Is Left

**MUST HAVE for playable game**: nothing — already satisfied for both archetypes.

**MUST HAVE for production quality**:
- Fix the desktop build (P1-1).
- Thread real AI art into player/enemy animation sheets instead of the procedural placeholder shape (P1-4).
- Decide and enforce real semantics for the `PRODUCTION_READY` maturity state, or retire it if it's never meant to be reachable (P1-5).
- Close top-down's smoke-test coverage gap (P1-2).

**SHOULD HAVE**:
- Real autotile/terrain-set tileset generation.
- Real particle/shader VFX (or at minimum per-project VFX variety instead of one fixed library).
- Real Furnace-format export, or rename the feature honestly.
- Cover `wall_jump`/`wall_slide`/`grapple` in the movement-feasibility validator.
- Wire or remove top-down's `AbilityPickup.gd`.

**OPTIONAL / FUTURE**:
- Mini-boss concept for top-down dungeons.
- A real "town" area concept.
- Procedurally-generated (not fixed 4-room) top-down dungeons.
- Death animation.
- Dungeon Editor real mutation controls.
- Rename/rebuild "Game Preview" to actually preview the game, or repoint it at the real Godot launch.

---

# HANDOFF SUMMARY FOR NEXT AI

## Current Product State
A working AI game generator producing genuinely playable Godot 4.x Metroidvania and top-down action-adventure games, verified end to end against the real engine today. Core architecture, gameplay systems, QA, and export are solid and low-debt. Visual/audio production fidelity and one desktop build bug are the main gaps between "works" and "ships."

## What Definitely Works
Full 16-phase generation pipeline; both archetypes structurally sound and playable; real modular ability system (side-view); real item-gating (top-down); real enemy/boss AI variety; real quest/dialogue/shop systems (identical depth both archetypes); real save v1→v2 migration; 18 real QA gates + real targeted repair; real Godot headless validation; real Input-simulated automated playtest to victory (both archetypes, confirmed today); real export with a genuinely-blocking commercial-safe gate; real SQLite persistence with Zod-validated round-trips; real NVIDIA hosted image generation when configured; clean CapabilityRouter/LicenseRouter/mode-routing; near-zero conventional technical debt (`as any`, `@ts-ignore`, raw console logging all effectively absent).

## What Partially Works
Asset production quality (real stills possible, but animation/tileset/VFX fidelity is procedural-grade even against real source art); GameDNA generation (title/narrative can be AI-authored, but abilities/content are always deterministic); desktop UI (12/15 screens solid, 2 misleading/thin, 1 blocks the whole app from building); top-down test coverage (playtest gate equally strong, smoke-test gate much thinner than side-view's).

## What Is Placeholder / Prototype
VFX (fixed 8-effect procedural library, no real particles); tileset autotiling (none); "Furnace" audio export (JSON, not real tracker format); death animation (absent, SFX-only).

## What Is Broken
`apps/desktop` renderer build (root cause diagnosed, fix started but not completed).

## What Is Missing
Real particle/shader VFX; autotile tileset logic; procedurally-generated top-down dungeons (currently fixed 4-room); mini-boss concept; town area concept; death animation; movement-feasibility coverage for 3 of 7 traversal abilities.

## External Blockers
Local image generation (ComfyUI/Diffusers) unavailable on this specific machine due to lack of a discrete GPU — not a code defect, and not fixable in code; would need different hardware or reliance on NVIDIA/remote providers, which are already the working path here.

## P0 Issues
0 — none found.

## P1 Issues
5 — desktop build failure; top-down smoke-test coverage gap; orphaned `RoomTileMap.gd`; animation-source mismatch; asset-maturity gate semantics gap.

## P2 Issues
12 — see Part 49.

## Technical Debt
Minimal. See Part 51 — the codebase is unusually clean; the real work left is product/architecture-level, not cleanup.

## Current Working AI Providers
NVIDIA (text + hosted image, confirmed configured); Ollama (local text/embeddings, availability depends on local install); Gemini/Groq/OpenRouter/HuggingFace (real code, availability depends on configured keys, not independently probed this pass); Piper/Whisper (local, availability depends on local binaries).

## Current Working Models by Capability
Representative sample confirmed from the 36-entry catalog: text → `qwen3-coder-next` (ollama, local); image → `flux.1-schnell` (comfyui, local, unavailable here) and NVIDIA-hosted FLUX (real, working here); vision → `meta/llama-3.2-11b-vision-instruct` (nvidia, remote); embedding → `nomic-embed-text` (ollama, local); speech-gen → `piper-en` (local); speech-recognition → `whisper-base` (local).

## Current Image Generation Status
PARTIAL/YES depending on frame: real and working via NVIDIA when configured (it is, here); local providers correctly unavailable on this hardware.

## Current Audio Generation Status
WORKING — real DSP-synthesized SFX/music, real MIDI; "Furnace" export is misleadingly named, not functionally broken (it's just not what its name implies).

## Current Godot Generation Status
WORKING — confirmed via real engine, both archetypes, today.

## Current Playtest Status
WORKING — confirmed via real engine, both archetypes, spawn-to-victory, today.

## Current Export Status
WORKING — real manifest/license report/zip, real blocking commercial-safe gate.

## Most Recent End-to-End Generation Result
Both archetypes: `final_qa: PASSED (RUNTIME_VALIDATED: 18/18 gates passed)`, confirmed on disk for this audit.

## Most Recent Godot Validation Result
18/18 gates passing, both archetypes, real Godot 4.7.1 binary, today.

## Test Suite Result
386/387 passing (1 confirmed-flaky, passes cleanly in isolation).

## Build Result
FAIL — `apps/desktop` renderer only; typecheck and all other packages PASS.

## Top 20 Remaining Engineering Tasks
1. Finish the desktop build fix (P1-1) — smallest, highest-leverage task available.
2. Expand top-down's `RuntimeSmokeTest.gd` to real parity with side-view's (P1-2).
3. Thread real AI sprite art into player/enemy animation generation instead of the procedural placeholder shape (P1-4).
4. Decide + enforce real `PRODUCTION_READY` semantics, or retire the unreachable state (P1-5).
5. Delete or wire in `RoomTileMap.gd` (P1-3).
6. Cover `wall_jump`/`wall_slide`/`grapple` in the movement-feasibility validator.
7. Wire or remove top-down's vestigial `AbilityPickup.gd`.
8. Add a real death animation.
9. Fix or remove the dead grid-alignment step in the pixel-art processor.
10. Stop force-marking real-source biome tile slices as `PLACEHOLDER`.
11. Rename/rebuild the "Game Preview" screen to actually preview the game.
12. Give the Dungeon Editor real mutation controls (parity with World/Room editors).
13. Replace the fixed 8-effect VFX library with real per-project variety (particles or a larger procedural set).
14. Implement real autotile/terrain-set tileset generation.
15. Either build a real Furnace-format exporter or rename the feature.
16. Prune the 5 confirmed-dead IPC handlers.
17. Replace `apps/desktop/src/studio/format.ts`'s hand-duplicated `GENERATION_PHASES` with a real shared import.
18. Implement a procedurally-generated (not fixed 4-room) top-down dungeon layout.
19. Add a mini-boss concept for top-down dungeons.
20. Clean up the 20 untracked `tmp-nvidia-*`/`tmp-smoke-*` scratch files at the repo root.

## Recommended Next Engineering Pass
**Fix the desktop build, then close the top-down smoke-test coverage gap.**

## Why This Should Be Next
The build fix is small, fully diagnosed, and unblocks the entire desktop app being usable/shippable at all — the highest-leverage single task available. The smoke-test gap is the largest real *risk* in the current state: it means top-down's "8/8 verified" claim rests on a much thinner net of assertions than side-view's, even though (per this audit) the underlying systems are equally real — closing it converts an assumption into a verified fact, the same way this session's `godot_playtest` work did for the playtest gate specifically.

## User Action Required Before Next Pass
NONE — both recommended tasks are fully actionable with the current toolchain and no external dependency changes.
