# MetroForge AI — Complete Post-Implementation Audit

**Audit type:** Source-verified, read-only. Every claim below is backed by a file:line citation or a command actually run in this environment. Where runtime verification was not possible, that is stated explicitly as UNKNOWN/NEEDS_VALIDATION rather than inferred. This document **replaces** all prior versions of `docs/METROFORGE_CURRENT_BUILD.md` — do not treat earlier revisions (or `docs/BUILD_STATUS.md`, which is stale and self-contradicts this audit in places) as current.

**Methodology:** Direct inspection (git, package manifests, config files, a fresh end-to-end generation + real Godot runtime validation) plus five parallel source-code investigation passes, each independently re-reading the relevant packages and reporting exact file:line evidence. No claim here is carried forward from a previous session's summary without being re-verified against current source.

### 2026-08-14 build sync — real image generation proven end-to-end

Full writeup: `docs/REAL_ASSET_PIPELINE_STATUS.md`. Full fresh audit this same day, prior to this
pass: `docs/METROFORGE_COMPLETE_BUILD_STATE.md` (supersedes this document's older sections below
wherever they conflict — that document is the more current source of truth for anything not listed
in this table).

| Area | Current state | Key files |
|---|---|---|
| Real image generation | **NVIDIA hosted FLUX proven end-to-end**: real network generation, real bytes, real Godot integration, 18/18 runtime gates, both archetypes | `nvidia-image.ts`, `asset-pipeline.ts` |
| PNG decoder | **Fixed a critical bug**: never implemented PNG scanline unfiltering, so real (externally-encoded) AI images decoded as ~99.996% transparent on ingestion — silently destroyed real art while procedural placeholder art happened to round-trip fine. Rewrote with real Sub/Up/Average/Paeth reconstruction; deleted a byte-identical duplicate decoder that was the actual hot path | `packages/assets/src/png.ts`, `pixel-art-processor.ts` |
| Asset maturity ladder | `PRODUCTION_READY` was structurally unreachable (every code path forced `productionReady: false`); now reachable via high-confidence critique score. Added `PROCESSED` (reserved, unassigned) | `packages/shared/src/asset-maturity.ts` |
| Provider health monitor | Rich per-provider status (`HEALTHY`/`DEGRADED`/`AUTH_FAILED`/etc.) was being collapsed to a boolean before reaching a snapshot; now carried through with `OFFLINE`/`UNKNOWN` added for full 9-state coverage | `provider-health-monitor.ts` |
| Desktop app build | Fixed: Vite renderer was failing on `packages/shared/src/config.ts`'s Node-only code leaking in through the shared package's flat export barrel. Full `pnpm run build` passes clean | `packages/shared/package.json`, `SettingsScreen.tsx` |
| Map system | Verified already fully implemented/wired for both archetypes (real bugs blocking it were fixed earlier the same day, separate from this pass) — not a gap despite older planning docs describing it as missing | `MapManager.gd`, `WorldMapPanel.gd`, `PauseMenu.gd` |
| Tests | **388/388 passing** (81 files), **`pnpm run build` and `pnpm run typecheck` both succeed clean** | vitest |

### 2026-08-13 build sync

| Area | Current state | Key files |
|---|---|---|
| Extended abilities (9) | **grapple, swim, phase** added to registered set + Godot runtime + room placements | `registered-abilities.ts`, `GrappleAbility.gd`, `WaterZone.tscn`, `PhaseBarrier.tscn` |
| Movement-feasibility QA | **`validateMovementFeasibility()`** static gate; gate transitions aligned to ability axes | `movement-feasibility.ts`, `world.ts`, `validator.ts` |
| Playtest personas + telemetry | **victory_rusher / ability_collector**; balance hints; `playtest_telemetry.json` | `playtest-persona.ts`, `PlaytestAgent.gd`, `playtest-output.ts` |
| Dashboard playtest panel | Route, persona, last-run metrics in **Project Dashboard** | `ProjectDashboard.tsx`, `project-loader.ts` |
| Tests | **259/259 passing** (59 files), **`pnpm build` succeeds** | vitest |

### 2026-08-12 build sync (post-audit)

The sections below still contain historical 2026-08-11 audit detail. These items were **verified since** and supersede the stale claims called out in §9 (catalog), §32 (VFX), §44 (playtesting), and the repo tree's `models.default.json` reference:

| Area | Current state | Key files |
|---|---|---|
| Model catalog ↔ live router | **Reconciled** — `config/models.catalog.json` is canonical; `models.default.json` deleted; `reconcileModelCatalog()` in `packages/ai/src/catalog-reconciliation.ts`; desktop `list-models` returns `routable`/`liveListed` | `bootstrap.ts`, `handlers.ts` |
| Automated playtesting | **Input bot added** — `planVictoryRoute()` → `playtest_route.json`; `PlaytestAgent.gd` simulates movement/attack; `godot_playtest` QA gate | `playtest-route.ts`, `PlaytestRunner.gd` |
| Rich VFX | **8 procedural textures** + `VFXManager` ring bursts; boss phase/area/slam + player ground slam wired | `VFXManager.gd`, `asset-pipeline.ts` |
| Mid-run cancel | **Cooperative `AbortSignal`** through pipeline + asset loops + image providers | `cancellation.ts`, `asset-pipeline.ts` |
| Tests | **237/237 passing** (`pnpm test`), **`pnpm build` succeeds** | vitest across 55 files |

---

## 1. Repository Snapshot

| Field | Value |
|---|---|
| Project name | MetroForge AI (`metroforge-ai`) |
| Version | `0.1.0` (root `package.json`) |
| Git branch | `master` |
| Latest commit | `a40914c24193f0bf70af6d116daad77eb5fe6816` — 2026-08-11 22:10:35 -0500 — "Verify Godot runtime end-to-end; add NVIDIA provider, routing consolidation, save/audio/animation systems" |
| Uncommitted changes | Yes — 22 modified files + 10 new untracked files (see below), all from an in-progress session of Godot-runtime fixes/features. Nothing committed since the audit began. |
| Package manager | pnpm (workspace, `pnpm-workspace.yaml`: `apps/*`, `packages/*`) |
| Node version | v24.19.0 |
| pnpm version | 10.15.0 |
| Python | 3.11.9, detected at `C:\Users\alexa\AppData\Local\Programs\Python\Python311\python` |
| Godot | **Detected**: `4.7.1.stable.official.a13da4feb`, via `GODOT_EXECUTABLE` in `.env` |
| Ollama | **Not detected** — not on PATH, `metroforge doctor` reports `[!] Ollama: Not detected` |
| ComfyUI | **Not reachable** — no server running on the default `http://localhost:8188` |
| FFmpeg | **Not detected** — not on PATH |
| NVIDIA provider | **NOT CONFIGURED** — `NVIDIA_API_KEY` is empty in `.env`; `doctor` reports `[!] NVIDIA NIM: API Key: NOT CONFIGURED` |
| Operating system | Windows 11 (MINGW64/Git Bash shell; `uname`: `MINGW64_NT-10.0-26200`) |
| Build command | `pnpm build` → `pnpm -r run build` (per-package `tsc`) |
| Test command | `pnpm test` → `vitest run` |
| Lint command | `pnpm lint` → `eslint . --ext .ts,.tsx` |
| Typecheck command | `pnpm typecheck` → `pnpm -r run typecheck` |
| CLI entrypoint | `apps/cli/src/index.ts` → built to `apps/cli/dist/index.js`, invoked as `metroforge` |
| Desktop entrypoint | `apps/desktop/electron/main.ts` (Electron main) + `apps/desktop/src/main.tsx` (React renderer) |

**Uncommitted files** (`git status --short`): modified — `docs/IMPLEMENTATION_STATUS.md`, `docs/METROFORGE_CURRENT_BUILD.md`, `packages/assets/src/asset-pipeline.ts`, `packages/generation/src/pipeline.ts`, `packages/godot/src/{assembler.ts,assembler.test.ts}`, `packages/procedural/src/{content.ts,content.test.ts}`, `packages/qa/src/validator.ts`, `packages/shared/src/constants.ts`, `templates/godot-metroidvania/project.godot`, `templates/godot-metroidvania/scenes/{bosses/Boss.tscn,enemies/Enemy.tscn,world/World.tscn}`, `templates/godot-metroidvania/scripts/{AI/BossController.gd,AI/EnemyController.gd,UI/GameHUD.gd,combat/HitboxComponent.gd,core/GameManager.gd,core/SaveManager.gd,player/PlayerController.gd,test/RuntimeSmokeTest.gd}`. Untracked (new) — `templates/godot-metroidvania/scenes/{enemies/Projectile.tscn,world/ItemPickup.tscn,world/NPC.tscn,world/PauseMenu.tscn}`, `templates/godot-metroidvania/scripts/{UI/PauseMenu.gd,combat/Projectile.gd,core/QuestManager.gd,core/SettingsManager.gd,world/ItemPickup.gd,world/NPC.gd}`.

---

## 2. What Changed Since The Last Audit

The prior `METROFORGE_CURRENT_BUILD.md` was an audit-only inspection (no Godot binary available at the time). Since then, a real Godot 4.7.1 binary was obtained and used to live-verify every claim below via `metroforge validate <slug> --runtime`, run repeatedly against fresh generations (most recently `godot_runtime: 94/96` on a TINY_TEST project generated fresh for this audit, and `godot_runtime: 96/96` on a MEDIUM-profile regression run earlier this session).

### New/fixed since the last audit — verified wired, tested where noted

| Subsystem | Files | Wired? | Runtime-verified? |
|---|---|---|---|
| `.env` loading (was a P0 bug — never loaded anywhere) | `packages/shared/src/config.ts` | Yes | Yes |
| NVIDIA NIM provider (text generation only) | `packages/ai/src/providers/nvidia.ts` (+18 unit tests) | Yes, gated on `NVIDIA_API_KEY` | Unit-tested with mocked `fetch`; **never exercised against the real NVIDIA API in this environment** (no key configured) |
| Routing consolidation (`GenerationRouter` → facade over `CapabilityRouter`/`FallbackManager`) | `packages/ai/src/generation-router.ts` | Yes — confirmed the only router `packages/generation/src/pipeline.ts` calls | 10 unit tests |
| `GENERATION_PHASES` vs. actual `report()` calls | `packages/shared/src/constants.ts`, `packages/generation/src/pipeline.ts` | Yes — 16/16 phases have a matching `report()` call, including `export` after `final_qa` | Confirmed via live DB query earlier this session |
| Godot runtime smoke-test harness | `templates/godot-metroidvania/scripts/test/RuntimeSmokeTest.gd` (918 lines) | Yes — **default when Godot available** (2026-08-12); `--skip-runtime-validation` opts out — see §42 | Yes: 94/96 (TINY_TEST) + `godot_playtest` input bot |
| AudioManager real playback | `templates/godot-metroidvania/scripts/core/AudioManager.gd` | Yes | Yes |
| Save/load reachable via SavePoint | `SavePoint.gd/.tscn`, `SaveManager.gd` | Yes | Yes |
| NPCs (generator + runtime interactable) | `packages/procedural/src/content.ts`, `templates/godot-metroidvania/scripts/world/NPC.gd` | Yes | Yes |
| Quests (`QuestManager` autoload) | `templates/godot-metroidvania/scripts/core/QuestManager.gd` | Yes, but only 2 of 10 schema-defined objective types (`Reach`, `BossKill`) are ever generated or trackable | Yes |
| Item pickups | `templates/godot-metroidvania/scripts/world/ItemPickup.gd/.tscn` | Yes — currency, consumable, relic, charm, key, upgrade_material (6 of 9 schema categories) | Yes |
| Currency HUD | `templates/godot-metroidvania/scripts/UI/GameHUD.gd` | Yes | Yes |
| Pause menu + settings persistence | `PauseMenu.gd/.tscn`, `SettingsManager.gd` | Yes | Yes |
| **Enemy/boss stats + combat-type variety** (real bug fix: `ContactHitbox.activate()` was never called for melee enemies) | `EnemyController.gd`, `Projectile.gd` | Yes | Yes |
| **Multi-boss placement** (real bug fix: only one hardcoded "last room" ever got a Boss instance, `boss_id` was never set) | `packages/godot/src/assembler.ts`, `BossController.gd` | Yes | Yes, at SMALL (2 bosses) and MEDIUM (5 bosses) scale |
| Boss attack variety (slam/projectile/area_burst, driven by real generated phase data) | `BossController.gd` | Yes | Yes |
| **P0: enemies/bosses were completely unkillable by the player** (`HurtboxComponent.hit_received` was never connected to `HealthComponent.take_damage` on either controller) | `EnemyController.gd`, `BossController.gd` | Yes, fixed | Yes |
| Player death/respawn now uses the real save checkpoint (previously teleported to a hardcoded in-room point and healed in place, ignoring `SaveManager` entirely) | `GameManager.gd`, `PlayerController.gd` | Yes | Yes |
| Game Over overlay | `GameHUD.gd`, `World.tscn` | Yes | Yes |
| Boss weakness mechanic (`dash_through` — the only weakness value ever generated) | `BossController.gd` | Yes | Yes |
| Enemy/boss hurt-flash animation + a real crash fix (freed `owner_node` passed into `receive_hit()` if the firing enemy/boss died before its projectile landed) | `packages/assets/src/asset-pipeline.ts`, `HitboxComponent.gd`, `Projectile.gd` | Yes | Yes |

### Explicitly requested items — checked individually, not assumed

| Requested item | Status | Evidence |
|---|---|---|
| Canonical `GenerationRouter` | **DONE** | `packages/ai/src/generation-router.ts:76-137` — the sole router; its own doc comment (lines 59-74) discloses it replaced an earlier catalog-driven version that was "fully built but never actually called by the generation pipeline" |
| Duplicate router consolidation | **DONE** | No duplicate `GenerationRouter`/`CapabilityRouter`/`FallbackManager`/`ProviderRegistry`/`ModelRegistry` classes exist — one definition each, confirmed by grep |
| NVIDIA NIM provider | **DONE (text only)** | `packages/ai/src/providers/nvidia.ts` |
| NVIDIA text generation | **DONE** | `/chat/completions` only, real retry/backoff/error-code handling |
| NVIDIA image generation | **NOT IMPLEMENTED** | Zero endpoint calls, request builders, or capability declarations for image gen anywhere in `nvidia.ts` |
| NVIDIA vision support | **NOT IMPLEMENTED** | Same — no vision capability anywhere in the file |
| `LicenseRouter` | **PARTIAL** | `packages/ai/src/license-router.ts` — classifies license/commercialUse; wired into `CapabilityRouter.getCandidates()` when `commercialSafeOnly` is set |
| `ProviderHealthMonitor` | **NOT IMPLEMENTED** | Zero matches repo-wide |
| Model license metadata | **PARTIAL** | Fields exist and `LicenseRouter` enforces when `commercialSafeOnly` is set — default generation mode does not enable it (§9) |
| `FREE_ONLY` enforcement | **DONE** | `packages/ai/src/registry.ts:56,65` — filters providers/models by `costClass === 'free'` |
| `LOCAL_ONLY` enforcement | **DONE** | `registry.ts:55,64` — filters by `p.local`/`m.local`; this is also the CLI default |
| `NVIDIA_ONLY` mode | **DOES NOT EXIST** | `GenerationMode` type has exactly 4 values (`FREE_ONLY`, `LOCAL_ONLY`, `HYBRID_FREE`, `CUSTOM`) — no such mode was ever added |
| `COMMERCIAL_SAFE` mode | **DOES NOT EXIST** | Same — zero matches for this string anywhere as a mode |
| Image routing through `GenerationRouter` | **NOT DONE — separate router** | `packages/assets/src/image-router.ts`'s `ImageProviderRegistry` mirrors `CapabilityRouter`'s algorithm but is a deliberately separate class (avoids a cross-package dependency); image capability is explicitly excluded from `GenerationRouter`'s own capability map |
| Audio routing through `GenerationRouter` | **NOT DONE** | No audio-generation provider routing exists at all — audio is procedural-only (WAV synthesis + optional local Stable Audio worker invoked directly, not through any router) |
| Asset Generation Matrix | **NOT IMPLEMENTED** | No such class/concept exists anywhere |
| Asset Foundry (as a named architecture) | **NOT IMPLEMENTED** | See §24 — none of the 18 requested class names exist; one real class (`AssetPipeline`) does all asset work |
| `CharacterVisualDNA` | **NOT IMPLEMENTED** | Zero matches |
| `PixelStyleBible` | **NOT IMPLEMENTED** | Zero matches |
| `SpriteCompiler` | **NOT IMPLEMENTED** | Zero matches |
| `AnimationCompiler` | **NOT IMPLEMENTED** | Zero matches |
| `TileCompiler` | **NOT IMPLEMENTED** | Zero matches |
| `IconCompiler` | **NOT IMPLEMENTED** | Zero matches |
| `UICompiler` | **NOT IMPLEMENTED** | Zero matches |
| `AudioCompiler` | **NOT IMPLEMENTED** | Zero matches |
| `MusicCompiler` | **NOT IMPLEMENTED** | Zero matches (music generation is real, just not behind a class of this name — see §33) |
| SpriteFrames generation | **RUNTIME ONLY, no `.tres` files** | `AnimatedAssetSprite.gd` builds `SpriteFrames` objects in-memory at `_ready()`; `find . -iname "*.tres"` returns zero files repo-wide |
| Player asset vertical slice | **DONE** | walk + attack + hurt sheets, all consumed |
| Tileset vertical slice | **DONE (runtime-constructed, no `.tres`)** | `RoomTileMap.gd` builds a `TileSet` object at runtime from a source PNG |
| Enemy family asset pipeline | **PARTIAL** | walk + hurt sheets per enemy; no attack sheet, no family-level (vs. per-index) visual variety |
| Boss asset pipeline | **PARTIAL** | walk + hurt sheets; no attack sheet; only ever one boss visual (`boss_final`) regardless of how many bosses are generated — see §16 |
| Asset provenance | **PARTIAL** | `generation_manifest.json` records `{id, path, type, provider, fallbackGenerated, critiquePassed, critiqueScore}` per artifact — no model/prompt-hash/parent-asset/compiler-version fields (see §38) |
| Asset dependency graph | **NOT IMPLEMENTED** | No such structure exists |
| Selective regeneration | **PARTIAL** | Only Game DNA and sprite/tileset generation support a coarse `--resume` checkpoint-skip; no fine-grained "regenerate only what changed" propagation |
| Asset coverage reporting | **IMPLEMENTED** | `asset_coverage.json` written by `packages/generation/src/pipeline.ts` after asset generation |

**None of the above were marked complete merely because a file/class existed** — each was checked for an actual call site in the live generation path.

---

## 3. Full Relevant Repository Tree

```
apps/
  cli/src/
    index.ts                          # registers 7 commands: doctor, create, generate, providers, validate, models, scout
    commands/{create,doctor,generate,models,providers,validate}.ts
  desktop/
    electron/{main,preload,handlers}.ts
    src/{App.tsx,main.tsx,styles.css}  # App.tsx is the only significant component file — no other .tsx exists
config/
  models.catalog.json                 # sole canonical model metadata source (loaded via ModelCatalogService + reconcileModelCatalog)
  providers.default.json
docs/
  AI_MODELS.md, ARCHITECTURE.md, BUILD_STATUS.md (stale), CLAUDE_REPOSITORY_AUDIT.md,
  DECISIONS.md, IMPLEMENTATION_STATUS.md, METROFORGE_CURRENT_BUILD.md (this file),
  METROFORGE_IMPLEMENTATION_MANIFEST.json, MODEL_ECOSYSTEM.md, PROVIDERS.md
packages/
  ai/src/
    registry.ts                       # ProviderRegistry, ModelRegistry, CapabilityRouter, FallbackManager
    generation-router.ts              # GenerationRouter (canonical text-gen entry point)
    bootstrap.ts                      # wires providers based on mode + env keys
    model-catalog.ts, model-scout.ts, model-benchmark.ts, model-download-manager.ts
    hardware-profiler.ts, provider-plugin.ts, types.ts
    generators/game-dna.ts
    providers/{base-http,gemini,groq,huggingface,nvidia,ollama,openrouter}.ts
  assets/src/
    asset-pipeline.ts                 # AssetPipeline — the real, only, asset generation entrypoint
    png.ts                            # hand-rolled PNG encoder + procedural sprite/sheet synthesis
    pixel-art-processor.ts            # scale/quantize/alpha-clean/grid-align
    image-router.ts                   # ImageProviderRegistry (separate from GenerationRouter)
    vlm-critic.ts                     # Ollama-vision-backed asset critique
    providers/{comfyui,diffusers}.ts
  core/, database/, generation/, godot/, procedural/, qa/, schemas/, shared/, tools/
    (see package-by-package notes in §4-6 below)
templates/godot-metroidvania/
  project.godot                       # 6 autoloads: GameManager, EventBus, SaveManager, AudioManager,
                                       #   ProgressionManager, SettingsManager, QuestManager (7 total)
  scenes/
    boot/Main.tscn
    player/Player.tscn
    enemies/{Enemy,Projectile}.tscn
    bosses/Boss.tscn
    world/{World,AbilityGate†,AbilityPickup,ItemPickup,NPC,PauseMenu,RoomTransition,SavePoint}.tscn
    test/RuntimeSmokeTest.tscn
  scripts/
    core/{GameManager,EventBus,SaveManager,AudioManager,ProgressionManager,SettingsManager,QuestManager,
          AnimatedAssetSprite,AssetSprite†}.gd
    AI/{EnemyController,BossController}.gd
    combat/{HealthComponent,HitboxComponent,HurtboxComponent,Projectile}.gd
    player/PlayerController.gd
    world/{WorldManager,AbilityGate†,AbilityPickup,ItemPickup,NPC,RoomTileMap,RoomTransition,SavePoint}.gd
    UI/{GameHUD,PauseMenu,TitleScreen}.gd
    test/RuntimeSmokeTest.gd
workers/
  diffusers_image_worker.py, diffusers_audio_worker.py, requirements-diffusers.txt
```
†`AbilityGate.gd`/`.tscn` and `AssetSprite.gd` are orphaned dead code — see §5 and §51.

---

## 4. Current Architecture

**Real request flow for the primary generation path** (Game DNA / text generation):

```
Prompt
→ apps/cli create command (or desktop generate-game IPC)
→ GenerationPipeline.run() (packages/generation/src/pipeline.ts)
→ bootstrapProviders() (packages/ai/src/bootstrap.ts) — registers providers by mode + env keys
→ GenerationRouter.generate({capability, task, prompt, mode, jsonMode})
→ CapabilityRouter.getCandidates() (filters ProviderRegistry.listEnabled() by localOnly/freeOnly/capability)
→ FallbackManager.withFallback() (tries up to 3 candidates, catches + advances on error)
→ a TextGenerationProvider (Ollama by default under LOCAL_ONLY; NVIDIA/Gemini/Groq/OpenRouter/HuggingFace
   only if mode ∈ {HYBRID_FREE, FREE_ONLY, CUSTOM} and the matching API key is set)
→ generateGameDNA() parses the response; on any failure, falls back to createDeterministicGameDNA()
   (a template-filled GameDNA — this is the actual result for every generation run observed in
   this environment, since no LLM provider is reachable: Ollama absent, no hosted keys configured)
→ generateDesignBible() (deterministic, packages/procedural/src/bibles.ts)
→ generateWorldTopology() + validateReachability()/validateWorldReachability() (packages/procedural/src/world.ts)
→ generateGameContent() (enemies/bosses/quests/items/NPCs — packages/procedural/src/content.ts)
→ synthesizeAllSfx() + generateMusicFromAudioBible() (packages/procedural/src/{audio,music}.ts)
→ AssetPipeline.generate() (packages/assets/src/asset-pipeline.ts) — procedural sprites/tilesets always;
   AI image gen (ComfyUI/Diffusers) attempted only if a local server is reachable, never in this environment
→ GodotProjectAssembler.assemble() (packages/godot/src/assembler.ts) — copies the template, writes
   per-room .tscn scenes + JSON data files
→ QAValidator.validateProject() — 9 static gates + validateGodotHeadless() (real Godot --import/--quit-after 1)
→ RepairEngineer.repair() if any gate failed (deterministic, template-copy based, one pass, no retry loop)
→ [optional, NOT automatic] metroforge validate --runtime → QAValidator.validateGodotRuntime()
   (spawns Godot, runs the generated project's own RuntimeSmokeTest.tscn)
```

**Critical accuracy note**: the static-QA-then-optional-runtime-check split in the last two steps is not cosmetic — `packages/generation/src/pipeline.ts` **never calls `validateGodotRuntime()`**. Every `metroforge generate`/`create` run is validated only by 9 static checks plus a Godot headless parse pass. The full "spawn the player, walk through rooms, fight enemies, save/load" proof only happens when a human explicitly runs `metroforge validate <slug> --runtime` afterward. See §42.

---

## 5. Duplicate Architecture Check

| System | Duplicates found? | Detail |
|---|---|---|
| `GenerationRouter` | No | One class, `packages/ai/src/generation-router.ts:76`. A prior catalog-driven version existed and was replaced (not left running in parallel) — its own doc comment discloses this history. |
| `CapabilityRouter` | No | One class, `packages/ai/src/registry.ts:41`. |
| `ProviderRouter` | Does not exist | No class by this name anywhere. |
| `FallbackManager` | No | One class, `registry.ts:70`. |
| `ProviderRegistry` | No | One class, `registry.ts:3`. |
| `ModelRegistry` | No | One class, `registry.ts:23`. Loads **`config/models.catalog.json` via `reconcileModelCatalog()`** in `bootstrap.ts` — hosted `enabled` flags overridden by live provider registration (see 2026-08-12 sync above). |
| `LicenseRouter` | Does not exist | Zero matches. |
| `ProviderHealthMonitor` | Does not exist | Zero matches. |
| `ToolRegistry` | No | One class, `packages/tools/src/registry.ts`. |
| `AssetRegistry` / Asset Foundry | Does not exist | See §24. |
| `SpriteCompiler` / `AnimationCompiler` / `TileCompiler` | Do not exist | See §24. |
| Godot validator | No duplicate class, but a **dead duplicate method**: `GodotProjectAssembler.validate()` (`packages/godot/src/assembler.ts:605-624`) runs the byte-for-byte same `execSync` Godot invocation as `QAValidator.validateGodotHeadless()` (`packages/qa/src/validator.ts:251`), and is **never called from anywhere** in `packages/` or `apps/`. Canonical: `QAValidator`. Dead: `GodotProjectAssembler.validate()`. |
| Godot assembler | No | One class, `GodotProjectAssembler` (`assembler.ts:343`). |
| Job manager | No | One orchestrator (`GenerationPipeline`) + one repository (`JobRepository`). |
| Settings manager | No true duplicate | `SettingsManager.gd` (Godot player/device prefs, `user://settings.json`) is deliberately separate from `SaveManager.gd` (progress, `user://savegame.json`) — documented as an intentional split, not overlapping responsibility. `packages/shared/src/config.ts`'s `loadConfig()` is a third, unrelated concern (app/CLI env config). |
| Logger | No | One factory, `createLogger()` in `packages/shared/src/logger.ts`. |

---

## 6. Implementation Status Matrix

Legend: COMPLETE / PARTIAL / STUB / MOCK / BROKEN / MISSING / NEEDS_VALIDATION

### Application

| Item | Status | Note |
|---|---|---|
| Desktop application | PARTIAL | 7 real, IPC-backed screens (Create, Projects, Models, Providers, QA, Settings + a static "Generation" placeholder tab); no game-content screens (expected — this is a tool UI, not the generated game) |
| CLI | COMPLETE | 7 commands (`doctor, create, generate, providers, validate, models, scout`), all real |
| Project management | PARTIAL | `ProjectRepository` real; no rename/delete/duplicate commands found |
| Settings UI | COMPLETE (desktop) | reads `getConfig()` via IPC |
| Settings persistence | PARTIAL | app-level config real; Godot player settings real (`SettingsManager.gd`); no desktop-app user-preference persistence beyond what's read from `.env`/config files |
| Database | PARTIAL | 3 of 6 tables (`projects`, `generation_jobs`, `generation_stages`) are real; 3 (`artifacts`, `validation_results`, `settings`) are created but never written/read by any code path |
| Logging | COMPLETE | `packages/shared/src/logger.ts`, JSON-line output, used throughout |
| Security | PARTIAL | see §47 — one real unescaped-shell-injection primitive in model downloads, one CLI path-traversal primitive; no leaks found for API keys; Electron isolation correctly configured |
| Job management | PARTIAL | create/track only; no pause/resume/cancel |
| Checkpointing | PARTIAL | Game DNA + sprite/tileset generation support `--resume`; no other phase does |
| Resume | PARTIAL | same scope as above |
| Retry | PARTIAL | provider-level retry (NVIDIA backoff, `FallbackManager` candidate advance) is real; no job-level retry |
| Cancellation | MISSING | no cancel command/IPC channel found |
| Pause/resume jobs | MISSING | no such concept in `JobRepository`/`GenerationPipeline` |

### AI Infrastructure

| Item | Status | Note |
|---|---|---|
| `ToolRegistry` | PARTIAL | exists (`packages/tools/src/registry.ts`), used for Godot-binary detection only |
| `HardwareProfiler` | COMPLETE | real GPU/VRAM detection via `wmic`/`nvidia-smi` |
| `ProviderRegistry` | COMPLETE | |
| `ModelRegistry` | COMPLETE | loads reconciled catalog entries; NVIDIA models routable when `NVIDIA_API_KEY` configured (see `bootstrap.test.ts`) |
| `ModelCatalog` (`ModelCatalogService`) | PARTIAL | real filtering/ranking logic exists but is **not called by the live generation path** — only by `models`/`scout` CLI commands |
| `ModelScout` | COMPLETE | real Ollama-tag scanning |
| `ModelDownloadManager` | PARTIAL (with a real security issue) | functional but see §47 finding #2 |
| `ModelBenchmarkService` | COMPLETE | real, runs against live Ollama when present |
| `GenerationRouter` | COMPLETE | |
| `CapabilityRouter` | COMPLETE | |
| `FallbackManager` | COMPLETE | |
| `LicenseRouter` | MISSING | does not exist |
| `ProviderHealthMonitor` | MISSING | does not exist as a distinct class (each provider has its own `getHealthDetails()`/`checkHealth()`, but nothing polls/aggregates across providers) |
| NVIDIA provider | PARTIAL | real, text-only, well-tested (18 unit tests), never exercised live (no key configured) |
| Ollama provider | COMPLETE (code) / NEEDS_VALIDATION (no Ollama installed here) | |
| Gemini provider | COMPLETE (code) / NEEDS_VALIDATION | disabled, no key |
| Groq provider | COMPLETE (code) / NEEDS_VALIDATION | disabled, no key |
| OpenRouter provider | COMPLETE (code) / NEEDS_VALIDATION | disabled, no key |
| Hugging Face provider | COMPLETE (code) / NEEDS_VALIDATION | disabled, no key |
| ComfyUI provider | COMPLETE (code, txt2img only) / NEEDS_VALIDATION | no server reachable in this environment |
| Diffusers provider | COMPLETE (code, txt2img only) / NEEDS_VALIDATION | correct `spawn()`+stdin-JSON pattern, no shell injection risk |
| llama.cpp provider | MISSING | no such provider exists |
| Vision provider abstraction | STUB | `VLMCritic` calls Ollama's `/api/chat` with an image for asset critique only; no general vision-provider interface |
| Audio provider abstraction | MISSING | no provider-routed audio generation; procedural synthesis + a direct (non-routed) Stable Audio worker call |
| Embedding provider | STUB | `EmbeddingProvider` interface exists (`provider-plugin.ts:141`), zero implementations, zero callers |
| Reranker provider | MISSING | taxonomy label only, no implementation |
| Project memory/RAG | MISSING | nothing found |

### Routing Modes

| Mode | Exists? | Enforced? |
|---|---|---|
| `FREE_ONLY` | Yes | Yes — `registry.ts:56,65` |
| `LOCAL_ONLY` | Yes | Yes — `registry.ts:55,64`; CLI default |
| `NVIDIA_ONLY` | **No** | — |
| `OFFLINE` | **No** | — |
| `FASTEST` | **No** | — |
| `HIGHEST_QUALITY` | **No** | — |
| `LOW_VRAM` | **No** | — (a `HardwareProfile` enum has a `BALANCED` member, unrelated to generation mode) |
| `BALANCED` | Not a mode | Exists only as a `HardwareProfile` value and an unrelated `qualityTarget: 'balanced'` string |
| `CUSTOM` | Yes | Registers hosted providers same as `HYBRID_FREE`; no distinct behavior found anywhere else |
| `COMMERCIAL_SAFE` | **No** | — |

---

## 7. NVIDIA Integration Audit

**File**: `packages/ai/src/providers/nvidia.ts`.

- **Base URL**: `https://integrate.api.nvidia.com/v1` default, overridable via `NVIDIA_API_BASE_URL`.
- **Auth**: `Authorization: Bearer ${apiKey}` header, built in `buildRequest()` (line 159) and the health-check call.
- **Secret handling**: key read only via `process.env.NVIDIA_API_KEY` at the two call sites (`pipeline.ts:137`, `doctor.ts`/`providers.ts`); `maskApiKey()`/`redact()` strip the literal key from any error string before it can surface (lines 38-51, applied at 206/227). No hardcoded key found anywhere — the only `nvapi-` string literals in the repo are the fake test fixture and a doc-comment example.
- **Health checking**: `getHealthDetails()` returns `{provider, configured, reachable, latencyMs, lastCheckedAt, errorCode}` — never the key.
- **Retry**: exponential backoff (`500ms × 2^attempt` + up to 25% jitter) on `{408,429,500,502,503,504}`; fails fast (no retry) on 400/401/403/404.
- **429 handling**: reads `Retry-After` header (seconds → ms) and uses it in place of computed backoff when present.
- **Timeout**: 120s on generation requests, 10s on `/models` health probes, via `AbortSignal.timeout()`.
- **Model selection**: `defaultModel` config, hardcoded fallback `'meta/llama-3.1-8b-instruct'` in `bootstrap.ts:111` — **not read from any catalog file**.
- **Text generation**: Yes, `/chat/completions`.
- **JSON generation**: Yes, via `jsonMode` request flag (OpenAI-compatible `response_format`).
- **Code generation**: Yes (same text endpoint, different prompt/capability tag upstream).
- **Vision support**: **No.**
- **Image generation**: **No.**
- **Image editing**: **No.**
- **Model discovery**: `GET /models` — confirmed live-verified earlier this session to be publicly readable even with an invalid key (a real API characteristic, documented in code comments as a known limitation of the health-check's certainty).
- **Model catalog entries**: 4 NVIDIA text models in `config/models.catalog.json`, **loaded by live `ModelRegistry` when provider is enabled** (see 2026-08-12 sync). Desktop UI shows `routable` + `liveListed` per entry.
- **License metadata enforcement**: **PARTIAL (2026-08-12)** — `LicenseRouter` (`packages/ai/src/license-router.ts`) classifies entries; `CapabilityRouter.getCandidates()` filters via `commercialSafeOnly`. Default generation mode does **not** set this flag, so unrestricted routing remains the norm.
- **Commercial-safe filtering**: opt-in via `commercialSafeOnly` context or `metroforge export --commercial-safe` (§9).
- **CLI visibility**: `doctor` and `providers` commands, key never printed.
- **Desktop visibility**: `list-providers` IPC handler (`bootstrap.ts:136-147`) returns provider status **without** an `apiKey` field — confirmed safe by direct read.
- **Tests**: `packages/ai/src/providers/nvidia.test.ts`, 18 tests, all passing, all against a mocked `fetch`.

**Every NVIDIA model configured** (`config/models.catalog.json`, all `enabled: false`, all `local: false`):

| Model ID | Capability | Active? | Tested? | License | Commercial | Source | Fallback priority |
|---|---|---|---|---|---|---|---|
| `meta/llama-3.1-8b-instruct` | TEXT_GENERATION, JSON_GENERATION, CLASSIFICATION, ROUTING | No (requires `NVIDIA_API_KEY` + provider enabled) | No (mocked-only) | Llama 3.1 Community License | allowed | Live-verified against `/v1/models` | 65 |
| `nvidia/llama-3.1-nemotron-70b-instruct` | TEXT_GENERATION, REASONING, JSON_GENERATION, WORLD_DESIGN, QA_REASONING, NARRATIVE | No | No | Llama 3.1 Community License | allowed | Same | 78 |
| `deepseek-ai/deepseek-v4-flash-0731` | TEXT_GENERATION, REASONING, JSON_GENERATION, WORLD_DESIGN, QA_REASONING | No | No | DeepSeek License | **unknown** | Same | 72 |
| `deepseek-ai/deepseek-coder-6.7b-instruct` | CODE_GENERATION, GDSCRIPT, JSON_GENERATION | No | No | DeepSeek License | **unknown** | Same | 60 |

**Not listed as implemented**: documentation-only models. The 4 NVIDIA text models above are in the canonical catalog and routable when the provider is enabled with a valid API key.

---

## 8. Routing Trace

| Task | Real path | Through canonical router? |
|---|---|---|
| Game DNA | `pipeline.ts` → `GenerationRouter.generate({capability:'JSON_GENERATION'})` → `CapabilityRouter`/`FallbackManager` → provider (Ollama by default; falls back to `createDeterministicGameDNA()` on any failure, which is the actual outcome every time in this environment) | Yes |
| GDScript/code generation | **No live call site found** — `CODE_GENERATION`/`GDSCRIPT` capabilities are mapped in `GenerationRouter`'s capability table but nothing in `packages/godot/src/assembler.ts` (which writes all `.gd` files) calls `GenerationRouter` — GDScript is 100% template-copied + string-templated, never AI-generated | N/A — capability defined but unused |
| Character concept image | `AssetPipeline.generate()` → `resolveImageGenerator()` → `ImageProviderRegistry.selectHealthy()` → ComfyUI or Diffusers if reachable, else procedural (`generateProceduralSprite`) | **Bypasses `GenerationRouter`** — separate `ImageProviderRegistry` |
| Sprite frame generation | Same `AssetPipeline` path; frame sheets (walk/attack/hurt) built via `generateWalkCycleSheet`/`generateAttackSheet`/`generateHurtFlashSheet` in `packages/assets/src/png.ts`, purely procedural, no provider call at all for the sheet step itself (only the base sprite may be AI-generated) | Bypasses both routers for the sheet-generation step |
| Tileset generation | Same `AssetPipeline` path; procedural `generateTilesetSource()` + optional AI base texture | Bypasses `GenerationRouter`; may use `ImageProviderRegistry` |
| Music generation | `generateMusicFromAudioBible()` (deterministic, `packages/procedural/src/music.ts`) + optional `enhanceMusicWithStableAudio()` which directly `spawn()`s the Diffusers Python worker — **no router involved at all** | Bypasses both routers entirely |
| SFX generation | `synthesizeAllSfx()` — pure procedural WAV synthesis, no provider/router involved | Bypasses both routers entirely |
| Vision QA | `VLMCritic.critique()` → direct `fetch` to Ollama's `/api/chat` — not through any router | Bypasses both routers |

**Summary**: only text/JSON/code-capability requests go through the canonical `GenerationRouter`. Every other modality (image, audio, music, vision) either uses the separate `ImageProviderRegistry` or bypasses routing infrastructure entirely with a direct call.

---

## 9. License Routing

**`COMMERCIAL_SAFE` generation mode does not exist** as a named enum (confirmed §6). **`LicenseRouter` does exist (2026-08-12)** and is wired into the live routing path when callers set `commercialSafeOnly: true` on the router context.

- **`LicenseRouter`** (`packages/ai/src/license-router.ts`): classifies `commercialUse`/`license` into `COMMERCIAL_SAFE`, `UNKNOWN`, `NON_COMMERCIAL`, etc. `'unknown'` is never treated as commercial-safe.
- **Live enforcement**: `CapabilityRouter.getCandidates()` (`packages/ai/src/registry.ts`) calls `passesCommercialSafe()` when `context.commercialSafeOnly` is set — filters both providers and models.
- **Default behavior**: normal `metroforge create`/`generate` does **not** set `commercialSafeOnly`, so unrestricted routing remains the default.
- **Export gate**: `metroforge export --commercial-safe` runs a license audit via `packages/tools/src/project-export.ts`.
- **Legacy unused filter**: `ModelCatalogService.filter({commercialAllowed})` still has zero enforcing callers.
- **Artifact-level provenance**: `generation_manifest.json` records provider/fallback status per asset, not license/commercial status (see §38).

**Can a model with `commercialUse = 'unknown'` be selected in default mode? YES** — unless `commercialSafeOnly` is explicitly set.

**Can UNKNOWN license status be selected in commercial-safe mode? NO** — `LicenseRouter` rejects unknown entries when filtering is active.

**Is this enforced by code, or only UI/documentation? Code, but opt-in** — enforcement exists in `registry.ts` + `license-router.ts`; default generation does not enable it. Export can opt in via `--commercial-safe`.

---

## 10. Game DNA

**Schema**: `packages/schemas/src/core.ts:88-142`, `GameDNASchema`. Actual fields: `version, identity{title,tagline?,genre,subgenre?,tone,visualStyle}, technical{resolution,tileSize,targetPlaytimeHours,difficulty}, combat{style,meleeEnabled,rangedEnabled}, movement{walkSpeed,runSpeed,jumpHeight,gravity}, abilities[]{id,name,category,enabled}, world{biomeCount,roomCount,regionCount?}, narrative{premise,protagonist,antagonist?,centralConflict}, audio?{musicStyle?,sfxStyle?}, seed, profile`.

| Requested field | Present? | Actually consumed downstream? |
|---|---|---|
| identity | Yes | Yes — title/tone/visualStyle drive bible generation and asset prompts |
| theme | **No** | — |
| tone | Yes (`identity.tone`) | Yes — `bibles.ts` |
| visualStyle | Yes | Yes — `bibles.ts`, `asset-pipeline.ts` (multiple sites) |
| pixelStyle | **No** | — |
| movement | Yes (walkSpeed/runSpeed/jumpHeight/gravity) | **No — dead field.** `PlayerController.gd` hardcodes its own defaults and is on the verbatim-restore template list; nothing patches it from GameDNA |
| combat | Yes (style/meleeEnabled/rangedEnabled) | Partial — only `combat.style` is read (one bible string); `meleeEnabled`/`rangedEnabled` are dead |
| abilities | Yes | Yes — assembler picks the first enabled ability for the world's ability pickup/gate; **but only `id: 'dash'` (index 0) ever has real runtime behavior** — see §14 |
| weapons | **No** | — |
| items | **No** (generated separately, not part of GameDNA) | — |
| economy | **No** | — |
| world | Yes (biomeCount/roomCount/regionCount) | Partial — `biomeCount` used; `roomCount` only used as a truthy-existence QA check (the real room count comes from an independent `resolveRoomCount()` call, can silently disagree); `regionCount` dead |
| biomes | **No** (count only, no biome definitions in GameDNA) | — |
| rooms | **No** | — |
| enemies | **No** (generated independently) | — |
| bosses | **No** (generated independently) | — |
| npcRequirements | **No** | — |
| quests | **No** (generated independently) | — |
| narrative | Yes | Partial — `protagonist`/`centralConflict` consumed; `premise`/`antagonist` dead |
| dialogueStyle | **No** | — |
| artDirection | **No** (separate `ArtBible` exists, not a GameDNA field) | — |
| animationDirection | **No** | — |
| vfxDirection | **No** | — |
| audio | Yes (optional) | Partial — `musicStyle` used as a fallback; `sfxStyle` dead |
| ui | **No** | — |
| accessibility | **No** | — |
| technicalBudget | Partial (`technical{resolution,tileSize,targetPlaytimeHours,difficulty}`) | Only `tileSize` consumed; the other 3 sub-fields dead |
| commercialPolicy | **No** | — |
| godotVersion | **No** | — |
| seed | Yes | Yes — written into `generation_manifest.json` |

**Net**: of the 30 requested fields, 10 map to something in the schema and 20 are entirely missing. Of the 10 present, roughly half their sub-fields are dead data (generated by both the AI and deterministic paths but never read downstream).

---

## 11. Narrative / Design Bibles

Searched for `DesignBible|NarrativeBible|ArtBible|AudioBible|CreativeConstitution|PixelStyleBible|CharacterVisualDNA|BiomeStyleDNA` — only **ArtBible, AudioBible, DesignBible** exist. `NarrativeBible`, `CreativeConstitution`, `PixelStyleBible`, `CharacterVisualDNA`, `BiomeStyleDNA` do not exist anywhere.

| Bible | Generated? | Schema-validated? | AI or deterministic? | Persisted? | Consumed downstream? |
|---|---|---|---|---|---|
| `DesignBible` (wraps art+audio) | Yes | Yes, `packages/schemas/src/bibles.ts` | **Deterministic** — `SeededRNG` + a hardcoded `STYLE_PALETTES` lookup table keyed by substring-matching `visualStyle`; no LLM call in `packages/procedural/src/bibles.ts` at all | Yes, `design_bible.json` | Yes (both sub-parts) |
| `ArtBible` | Yes | Yes | Deterministic | Yes (nested) | Partial — `characterGuidelines`, `environmentGuidelines.tileStyle`, `negativePrompts` used; `palette` (the actual generated hex colors) and `uiGuidelines` and `promptPrefixes` are **never read anywhere downstream** despite existing for exactly that purpose |
| `AudioBible` | Yes | Yes | Deterministic | Yes (nested) | Partial — `biomeThemes`/`musicStyle` used; `moodKeywords`/`instrumentation`/`sfxGuidelines`/`mixNotes` dead |

---

## 12. World Generation

**File**: `packages/procedural/src/world.ts` (387 lines).

- **World graph**: real, `WorldGraph{nodes,edges,regions}`, one node per room.
- **Biome graph**: implicit via `regions[]` grouping room ids by biome index — no separate biome-graph structure.
- **Room graph**: same as world graph.
- **Room archetypes generator can assign**: `tutorial, boss, ability_shrine, save, treasure, connector, traversal, combat, arena, ability_gate` (10 values, via `pickArchetype()` + special-casing). Schema (`RoomSchema.archetype`) defines 17 values — 7 (`puzzle, npc, shop, secret, challenge, set_piece, transition`) are **never assignable by the generator at all**.
- **Critical path**: `ProgressionGraph.criticalPath`, real.
- **Loops/secrets/shortcuts**: branching optional edges exist for 30+ room worlds (`buildEdges()`); no dedicated "secret" or "loop" concept beyond that.
- **Save rooms**: real, tagged via `index % 7 === 0` (after tutorial/boss/ability_shrine claims).
- **Boss rooms**: real, one per generated boss, at deterministic indices (see §16).
- **NPC rooms**: real, spread across interior rooms by `content.ts`, independent of the world-graph archetype system.
- **Shops**: schema value exists, never generated.
- **Ability rooms**: real (`ability_shrine`, `abilityGateRoomIndex()`).
- **Fast travel**: not implemented.
- **Biome transitions**: vertical "shaft" edges connect biome bands for medium+ worlds (`buildEdges()`).
- **Vertical/horizontal traversal**: both edge types exist (`transition: 'up'|'down'` vs. inferred left/right).

**Algorithms**: deterministic, seeded (`SeededRNG`), no AI involvement in world topology at all — confirmed by `world.ts` having zero provider/router imports.

**Assembler cross-reference (critical finding)**: `GodotProjectAssembler` (`packages/godot/src/assembler.ts:390-464`) only ever checks the world graph's real archetype tag for **2 of the 10 producible values** — `=== 'save'` and `=== 'treasure'`. Everything else (`boss`, `ability_shrine`, `tutorial`, `connector`, `traversal`, `combat`, `arena`, `ability_gate`) is either independently recomputed (boss placement uses `gameContent.bosses[].arenaRoomId`, not the graph tag; ability-shrine placement recomputes `Math.floor(roomCount*0.3)` independently) or has zero effect on assembly. Worse, the assembler then **overwrites** the true archetype when it writes `data/rooms/rooms.json` back out — a room genuinely tagged `connector`/`traversal`/`arena`/`ability_gate` is silently relabeled `'combat'` in the persisted output, permanently losing that distinction for any downstream consumer.

---

## 13. Progression

**File**: `packages/procedural/src/world.ts`. Three distinct validation functions exist, proving progressively different things:

1. **`validateReachability(progressionGraph, ...)`** — BFS over the small **abstract** ability-order graph (~N+2 nodes). Proves only that the ability unlock order is internally solvable in principle.
2. **`validateWorldConnectivity(worldGraph)`** — BFS over the **real, full room graph**, ignoring ability requirements. Proves basic topology has no unreachable islands.
3. **`validateWorldReachability(worldGraph, unlockedAbilities)`** — fixed-point iteration (not a single pass, deliberately, per its own doc comment, to catch abilities unlocked out of order) over the **real room graph with ability gating enforced**. This is the strongest proof: every real room is reachable via progressively-granted abilities on the actual generated layout.

All three are pure graph algorithms over abstract nodes/edges — **movement-feasibility** (`validateMovementFeasibility`) now adds a lightweight jump/dash reach audit against standard room layout constants, but there is still no tile-accurate physics simulation.

- Ability gates: real, enforced (`RoomTransition.gd`'s `required_abilities`), verified live this session and again this audit.
- Locks/keys: schema fields exist (`RoomEntranceSchema.locked/keyId`), never populated by the generator.
- Boss gates: the boss room is reachable like any other room; no distinct "boss gate" mechanic beyond the boss itself blocking further progress via the fight.
- Circular dependency detection: not explicitly implemented — the fixed-point `validateWorldReachability` algorithm is robust to cycles by construction (keeps expanding `visited` until no change), but there's no dedicated cycle-detection pass or error.
- Final-boss/ending reachability: proven at the graph level (the boss room is a `criticalPath` endpoint, confirmed reachable by the same functions).
- Backtracking analysis: not implemented.
- Movement feasibility: **not validated** — no jump-height/dash-distance-vs-room-geometry check exists anywhere.

**What is mathematically validated vs. merely generated**: room reachability under ability gating IS mathematically proven (real BFS/fixed-point graph algorithms, unit-tested in `world.test.ts`/`world-medium.test.ts`). Whether a human/player can *physically execute* that path (jump/dash distances, timing) is **not validated at all** — merely assumed.

---

## 14. Player Gameplay

Read `templates/godot-metroidvania/scripts/player/PlayerController.gd` in full (159 lines) plus `combat/*.gd`.

| Ability | Runtime implementation? |
|---|---|
| Movement (walk) | Real — `velocity.x = input_dir * speed` |
| Acceleration/deceleration | **No** — instant velocity set, no smoothing curve |
| Gravity | Real, hardcoded `980.0`/export default, not from GameDNA |
| Jump | Real |
| Variable jump height | **No** — fixed `jump_velocity` |
| Coyote time | Real — `coyote_time` timer |
| Jump buffer | Real — `jump_buffer_time` timer |
| Crouch | **No** |
| Dash | Real — the **only** ability with genuine runtime behavior |
| Air dash | **No** — dash works identically on ground/air, no distinct air-only variant |
| Double jump | **No** |
| Wall slide | **No** |
| Wall jump | **No** |
| Wall climb | **No** |
| Grapple | **No** |
| Swim | **No** |
| Ground slam | **No** |
| Phase | **No** |
| Gravity inversion | **No** |
| Melee | Real — `AttackHitbox.activate()`, real damage, real hurt animation |
| Ranged combat (player) | **No** — only enemies/bosses got ranged attacks this session; the player has no ranged option |
| Charged attacks | **No** |
| Combos | **No** |
| Parry | **No** |
| Block | **No** |
| Dodge (distinct from dash) | **No** |
| Stamina/resource systems | **No** — `resourceCost` exists on the (unused) rich `AbilitySchema` in `game.ts`, never wired to GameDNA's actual simpler ability shape or to any runtime resource meter |
| Damage | Real |
| Invulnerability | Real — brief i-frames after being hit |
| Knockback | Real |
| Death | Real |
| Respawn | Real — now correctly uses the save checkpoint (fixed this session) |

**For every ability GameDNA can generate** (`abilities[]{id,category,enabled}`, up to `PROFILE_DEFAULTS.abilities` count — 1 for TINY_TEST, up to 8 for LARGE): only `id === 'dash'` (always index 0) has any real runtime mechanic. `ability_1`, `ability_2`, ... generated for larger profiles get a pickup, a name, and a progression-graph gate — but **zero gameplay effect**; `GameManager._on_ability_acquired()` only special-cases `if ability_id == 'dash': _can_dash = true`, and `PlayerController.gd` has no generic ability-dispatch mechanism. This is the largest gap in the "does the ability mechanic actually work" chain for any profile larger than TINY_TEST.

---

## 15. Enemies

**Generation** (`packages/procedural/src/content.ts:16-40`): real per-enemy stat variety — `health` (20-50), `damage` (5-15), `speed` (60-100), `movement` (one of `patrol/hop/crawl/stationary`), `combat.type` (one of `melee/projectile`), `perception.radius`. Biome alignment via `biomeId: biome_${i % biomeCount}`. No resistances or drop tables generated (`lootTableId` field exists on the schema, never populated).

**Runtime** (`EnemyController.gd`, rewritten this session to read its own stats by `enemy_id` from `data/enemies/enemies.json`):

| Generated movement type | Runtime implementation |
|---|---|
| `patrol` | Real |
| `crawl` | Real (shares patrol's back-and-forth logic) |
| `hop` | Real (adds periodic vertical impulse) |
| `stationary` | Real (no horizontal movement) |
| `fly` | **Generator never produces this value** — schema allows it, content.ts doesn't |
| `hover`/`charge`/`teleport`/`burrow` | Same — schema values, never generated, **no runtime implementation exists for any of them** |

| Generated combat type | Runtime implementation |
|---|---|
| `melee` | Real — `ContactHitbox.activate()` now correctly called (was the P0 bug fixed this session) |
| `projectile` | Real — fires a `Projectile.tscn` instance toward the player |
| `beam`/`area`/`summon`/`trap` | Schema values, never generated, no runtime implementation |

Generated fields runtime ignores entirely: `resistances` (field doesn't exist on `EnemySchema` — not applicable), `lootTableId` (exists, never populated, never read), `perception.visionCone`/`lineOfSight` (generated with defaults, never read by `EnemyController.gd` — the enemy has no line-of-sight/vision-cone detection logic at all, it always attacks on a fixed cooldown regardless of player position/visibility).

---

## 16. Bosses

**Generation** (`content.ts:42-76`): `health`, `phases[]{phase,healthThreshold,attacks,telegraphDuration,recoveryWindow}`, `weaknesses` (always exactly `['dash_through']` — hardcoded literal, not varied), `rewardAbilityId`. Only 2 literal attack-name strings are ever generated across all phases: `'slam'`, `'projectile'`, plus `'area_burst'` for the final boss's phase 2 only.

**Runtime** (`BossController.gd`, rewritten this session):
- Arena: real — each boss placed at its real `arenaRoomId` (fixed this session; previously only the final boss's room ever got a Boss instance).
- Telegraph/recovery windows: **generated but not read** — `telegraphDuration`/`recoveryWindow` exist in the JSON data, `BossController.gd` never reads them; attack timing is driven by a separate hardcoded `_attack_cooldown` variable instead.
- Weak points: not a distinct mechanic; `weaknesses: ['dash_through']` is read and doubles damage when the player hits during a dash (added this session) — the only weakness value ever generated, so no variety exists.
- VFX/music on boss: `musicId` field exists, unused; no distinct boss-phase VFX.
- Rewards: `rewardAbilityId`/`rewardItemId` fields exist; not confirmed wired to an actual grant-on-defeat mechanic beyond the pre-existing `EventBus.boss_defeated` → `ProgressionManager.defeat_boss()` flow (ability/item rewards themselves are not observed being granted anywhere in `BossController.gd` or `GameManager.gd`).
- Runtime attack dispatch: real, this session — branches on the real per-phase `attacks` array (`slam`→melee hitbox, `projectile`→one shot, `area_burst`→6-way radial spread reusing the enemy `Projectile` system).
- Runtime phase transitions: real — `_on_health_changed()` advances `_phase` at the generated `healthThreshold`.
- Final boss victory path: real — `boss_id === 'boss_final'` (or `begins_with('final')`) triggers `GameState.VICTORY` in `GameManager._on_boss_defeated()`.

**Do generated attack names map to real mechanics? Yes, for exactly the 3 literal strings the generator ever produces** (`slam`, `projectile`, `area_burst`) — confirmed this session's own addition, live-verified. No other attack name is ever generated, so there's no unmapped-name gap in practice, though the schema's `weaknesses`/`attacks` fields are free-text strings with no enum constraint — a future generator change producing a new literal would silently fall through to the melee default (`BossController.gd`'s `match` has a default `_:` branch).

---

## 17. NPCs

- **Generator**: real, `content.ts:107-135`. Deterministic name/role (`quest_giver/merchant/lore/neutral` rotation)/room placement across interior rooms; `quest_giver` role references a real generated quest id.
- **Schema**: `NPCSchema` (`game.ts:217-228`) — `id, name, role, roomId, dialogueIds[], questIds[], shopId?, spriteId?`.
- **Placement**: real, assembler places an `NPC.tscn` instance per assigned room.
- **Visuals**: generated still + walk sheet (`assets/npcs/{id}.png` / `{id}_walk.png`), role-tinted humanoid palette, `AnimatedSprite2D` + `AnimatedAssetSprite.gd` (same path as player/enemies). Room assembler overrides `sheet_path` per NPC id.
- **Scene/controller**: real, `NPC.gd`.
- **Interaction**: real — approach + "interact" input opens `DialogueOverlay` (or shop for merchants).
- **Dialogue**: generated `dialogueIds` for quest-giver / merchant / lore / neutral trees; overlay UI with choices. No portraits, localization, or TTS.
- **Quests**: real association (quest-givers can hand off a real quest via interaction).
- **Shops**: `shopId` populated for merchants; `ShopManager` + `ShopOverlay` at runtime.
- **Schedules**: not implemented.
- **World-state reactions**: quest-state dialogue branching plus shop stock; no schedule or companion AI.

**Accurate classification**: NPC schema AND a real (if minimal) runtime both exist — this is genuinely **PARTIAL, functioning for its actual scope** (interaction + quest handoff), not "schema exists, runtime missing."

---

## 18. Dialogue

- **Dialogue data**: `content.ts` populates `dialogueIds` per NPC role (quest offer/active/complete, merchant greet, lore trees, neutral hints). Written to `data/dialogues/dialogues.json`.
- **Branching/conditions/choices**: real choice lines with `nextDialogueId` / `end` / `open_shop` actions in generated trees.
- **Quest/world-state triggers**: quest-giver trees pick offer/active/complete ids from `QuestManager` state; merchants route `open_shop` to `ShopOverlay`.
- **UI**: `DialogueOverlay.tscn` panel with speaker label, body, and choice buttons.
- **Portraits**: ColorRect placeholder in the overlay — not generated portrait art.
- **Localization**: not implemented.
- **Save-state integration**: dialogue is stateless; quest/shop state persists through existing managers.

---

## 19. Quests

- **Generation**: real, `content.ts:79-105` — deterministic, profile-scaled count, each quest has exactly one objective, type either `Reach` (target: a room id) or `BossKill` (target: a boss id, only for the last generated quest). Rewards are always a single `currency`/`scrap` entry.
- **Quest schema**: `QuestSchema` (`game.ts:249-260`) supports 10 objective types (`Kill, Collect, Reach, Discover, Talk, Activate, Interact, BossKill, AbilityAcquire, Choice`) — **only 2 (`Reach`, `BossKill`) are ever generated.**
- **Runtime manager**: real, `QuestManager.gd` (new this session) — reads `data/quests/quests.json`, tracks `LOCKED/AVAILABLE/ACTIVE/COMPLETE` state, advances objective progress from real `EventBus.room_entered`/`boss_defeated` signals (both already-existing, already-firing signals — no new emit wiring was needed for the 2 types that exist).
- **Quest state**: real, in-memory + persisted.
- **Objective types**: only `Reach`/`BossKill` have any tracking logic — the other 8 schema values would have no handler if ever generated (not currently possible, since the generator never produces them).
- **NPC integration**: real (quest-giver interaction accepts the linked quest).
- **EventBus integration**: real, reuses existing signals rather than adding new ones.
- **Rewards**: real — currency reward applied to `QuestManager.currency` on completion.
- **Persistence**: real, new backward-compatible `quests` block in `SaveManager`'s save file.
- **Quest log UI**: pause-menu `QuestPanel` (full log) plus always-visible HUD `QuestTrackerPanel` (active quests).
- **Validation**: no dedicated QA gate for quest solvability (e.g., "is every quest's target room/boss actually reachable/generated") beyond the general world-reachability checks, which don't specifically cross-reference quest target ids.

**Are generated quests still inert JSON? NO** — this was true before this session's work; it is no longer true. Quests are tracked, completable, and reward-granting through real gameplay signals, verified live via `RuntimeSmokeTest.gd`.

---

## 20. Inventory / Items / Economy

- **Item generation**: `content.ts` generates scrap, health vials, heart relics, power charms, rusted keys, upgrade shards, **forged_blade (weapon)**, **warden_seal (quest item)**, and **lost_echo collectibles** (1 on TINY_TEST, more unique echoes on SMALL+).
- **Pickups**: `ItemPickup.gd` in treasure/secret rooms. Currency and quest items are excluded from world pickups (quest items come from quest rewards). Secret rooms place collectibles; treasure rooms place equipment.
- **Inventory manager**: real autoload. Relics permanently raise max HP. Weapons and charms occupy loadout slots and only apply while equipped (auto-equip on pickup if the slot is empty). Unequip from the pause Inventory panel. Collectibles are tracked unique items with a found/total count.
- **Quest rewards**: first quest grants `warden_seal` in addition to scrap. Collect objectives target `lost_echo`.
- **Shops**: merchants sell vials, charms, and the forged blade.
- **Inventory UI**: pause Inventory panel lists items, shows equipped markers, and click-to-equip/unequip weapons and charms. HUD shows `Echoes: found/total`.
- **Persistence**: collected counts + equipped slots in SaveManager collectibles block.

---

## 21. Map

**Entirely missing.** `PauseMenu.tscn`'s "Map" button is `disabled = true`, tooltip "Not available yet," never connected to a handler. No room-discovery/visited-room tracking, no map rendering, no player/save/boss/NPC/ability markers, no completion percentage, no zoom/pan, no persistence — none of it exists anywhere in the codebase.

---

## 22. Save System

- **Save trigger**: real, `EventBus.save_triggered`, now emitted from multiple real gameplay events (SavePoint touch, ability pickup, boss defeat, quest completion).
- **Autosave**: real, on ability pickup and boss defeat (`GameManager.gd`).
- **Save points**: real, `SavePoint.gd`/`.tscn`, heals to full + records checkpoint.
- **Save slots**: **single slot only** — `SAVE_PATH := "user://savegame.json"`, no multi-slot concept.
- **Schema version**: real, `SAVE_VERSION := 2` constant exists in `SaveManager.gd`, but no migration logic runs if an old-version save is loaded — the version number is written but never checked/branched on read (confirmed by reading the full `load_game()` function: it reads fields with `.get(key, default)` fallbacks, which happens to be forward/backward-tolerant by accident of loose typing, not by an explicit migration step).
- **Backup**: not implemented.
- **Atomic writes**: **not implemented** — `save_game()` does a direct `FileAccess.open(SAVE_PATH, FileAccess.WRITE)` + `store_string()`; a crash mid-write would corrupt the save file with no backup/temp-file-then-rename pattern.
- **Player state**: real (health, position via checkpoint room).
- **Inventory**: currency only (see §20 — nothing else to save).
- **Quests**: real, new this session.
- **Abilities**: real.
- **Bosses**: real (`defeated_bosses` list).
- **World state**: placeholder only — `"world_state": {}` is written but never populated.
- **Map discovery**: placeholder — no map system to have discovery data for.
- **Settings**: real, but in a **separate** file (`user://settings.json` via `SettingsManager.gd`), not part of the save-game file — a deliberate, documented split (progress vs. preferences).
- **Load path**: real, `SaveManager.load_game()`, reachable from the title screen's "Continue" flow and from the death/respawn flow (new this session).

**Is saving reachable during actual play? YES** — confirmed live this session via `RuntimeSmokeTest.gd`'s `save_point_writes_save_file`/`save_reload_succeeds`/`save_reload_restores_checkpoint_room`/`save_reload_restores_defeated_bosses` checks, all passing.

---

## 23. Audio Runtime

- **AudioManager**: real, `AudioManager.gd` — pooled SFX playback (`SFX_POOL_SIZE = 8`), music switching with loop support, missing-file warnings instead of crashes.
- **`play_sfx`/`play_music`/`stop_music`**: all real and called from real gameplay events (jump, dash, hit, death, boss-hit, ability pickup, UI clicks, item pickup, NPC interaction).
- **SFX pooling**: real.
- **Music switching**: real, keyed by biome id on room entry.
- **Audio buses**: **not implemented** — no Godot `AudioBus` layout; volume is applied via direct `AudioStreamPlayer.volume_db`/similar per-player property, not a bus-routing graph.
- **Master/music/SFX volume**: real, exposed via `SettingsManager.gd`, persisted, live-adjustable from the pause menu.
- **Gameplay event call sites**: real, confirmed across `PlayerController.gd`, `HealthComponent.gd`, `AbilityPickup.gd`, `ItemPickup.gd`, `SavePoint.gd`, `NPC.gd`, `TitleScreen.gd`.
- **Boss music**: `Boss.musicId` field exists on the schema, not confirmed wired to a distinct boss-music-swap call (biome music continues playing during boss fights, based on code inspection — no `AudioManager.play_music()` call found inside `BossController.gd`).
- **Biome music**: real.
- **UI sounds**: real (`ui_click`).

**Are generated SFX actually played in-game now? YES** — confirmed live this session (`audio_manager_plays_sfx` check passing against a real Godot instance).

---

## 24. Asset Foundry

**None of the following exist anywhere in the codebase** (verified by `grep -rln` for each exact name across all `.ts` files, excluding `node_modules`/`dist`): `AssetGenerationMatrix`, `AssetSpecification`, `AssetGenerationService`, `AssetCompiler`, `AssetQA`, `AssetDependencyGraph`, `AssetProvenance`, `AssetRegenerator`, `CharacterVisualDNA`, `PixelStyleBible`, `BiomeStyleDNA`.

What exists instead, classified individually:

| Concept | Real file | Classification |
|---|---|---|
| Asset generation entrypoint | `packages/assets/src/asset-pipeline.ts` — class `AssetPipeline`, one public `generate()` method | COMPLETE, but a single monolithic function, not a matrix/graph/registry architecture |
| Image processing | `packages/assets/src/pixel-art-processor.ts` — `PixelArtProcessor.process()`: nearest-neighbor scale → palette quantization → alpha cleanup → optional grid alignment | COMPLETE (basic algorithms, no dithering/edge-awareness) |
| Procedural PNG/sheet synthesis | `packages/assets/src/png.ts` — hand-rolled PNG encoder, `generateWalkCycleSheet`/`generateAttackSheet`/`generateHurtFlashSheet`/`generateTilesetSource` | COMPLETE |
| Image providers | `packages/assets/src/providers/{comfyui,diffusers}.ts` | COMPLETE (txt2img only) |
| Vision/asset critique | `packages/assets/src/vlm-critic.ts` — real Ollama-vision call + deterministic fallback | COMPLETE for its narrow scope (single-asset critique) |
| `ArtBible` (closest thing to a "PixelStyleBible") | `packages/schemas/src/bibles.ts` + `packages/procedural/src/bibles.ts` | COMPLETE but under-consumed (§11) |

**Conclusion**: the formal "Asset Foundry" architecture described by the requested class names does not exist. A simpler, real, working pipeline exists instead, and does not fail silently — every generation run observed in this environment (no ComfyUI/Diffusers reachable) correctly falls back to procedural generation and reports `fallbackGenerated: true` per asset.

---

## 25. Asset Generation Matrix

**No matrix file, no schema file — this concept does not exist.** Reporting the equivalent breakdown from the real `AssetPipeline` instead, based on a fresh TINY_TEST generation observed this audit (2 enemies, 1 boss, 1 biome):

| Category | Required (this profile) | Generated | Compiled (Godot-ready) | Validated (VLM or deterministic) | Fallback used | Missing |
|---|---|---|---|---|---|---|
| Player | 1 base + walk + attack + hurt sheets = 4 | 4 | 4 (runtime SpriteFrames) | 4 (deterministic, no VLM reachable) | 4/4 | 0 |
| Enemy | 2 base + walk + hurt sheets = 6 (no attack sheet generated) | 6 | 6 | 6 | 6/6 | 0 (of what's attempted — attack sheets aren't attempted at all) |
| Boss | 1 base + walk + hurt = 3 (no attack sheet) | 3 | 3 | 3 | 3/3 | 0 (same caveat) |
| NPC | 1 still + walk sheet per NPC (TINY_TEST: 1 NPC = 2) | 2 | 2 (runtime SpriteFrames) | 2 (deterministic) | 2/2 | No attack/hurt sheets (NPCs are non-combat) |
| Tilesets | 1 source + 64 sliced tiles (8×8 grid) | 65 | 65 (runtime TileSet) | 65 | 65/65 | 0 |
| Backgrounds | 0 (biome texture used directly as room background, no separate background asset) | 0 | N/A | N/A | N/A | Distinct background layer generation |
| Props | 0 | 0 | N/A | N/A | N/A | Entire category |
| Items | 0 (items have no icon/sprite generation — currency/consumable are pure data) | 0 | N/A | N/A | N/A | Entire category |
| UI | 0 (HUD is hand-authored `.tscn`, not generated) | 0 | N/A | N/A | N/A | Entire category |
| VFX | 0 | 0 | N/A | N/A | N/A | Entire category |
| Audio (SFX) | 8 fixed ids | 8 | 8 (`.wav`, real Godot import) | N/A (no audio QA) | 8/8 procedural | 0 |
| Music | 1 per biome (WAV + MIDI + tracker-interchange JSON) | 3/biome | 3/biome | N/A | Yes | 0 |
| Portraits | 0 | 0 | N/A | N/A | N/A | Entire category |
| Weapons | 0 | 0 | N/A | N/A | N/A | Entire category |
| Icons | 0 | 0 | N/A | N/A | N/A | Entire category |

**Total asset types with any generator at all**: 7 (player, enemy, boss, NPC, tilesets, SFX, music) out of the 15 requested categories. 8 categories have zero generation of any kind.

---

## 26. Player Asset Pipeline

Traced, real stages only (the requested pipeline names like "CharacterVisualDNA"/"SpriteCompiler"/"AnimationCompiler" don't exist — mapping to what's actually there):

```
(no CharacterVisualDNA — ArtBible.characterGuidelines.player is the closest input)
→ generateProceduralSprite() (packages/assets/src/png.ts) — always runs first
→ [optional] real AI image gen via ComfyUI/Diffusers if a local server is reachable
  (never reachable in this environment — procedural result is used every time observed)
→ PixelArtProcessor.process() — scale/quantize/alpha-clean/grid-align
→ generateWalkCycleSheet() / generateAttackSheet() / generateHurtFlashSheet()
  (all packages/assets/src/png.ts — procedural sheet synthesis, not AI, regardless of
  whether the base sprite came from AI or procedural)
→ written to disk as flat PNGs (assets/characters/player_{walk,attack,hurt}.png)
→ Godot's own .import pipeline converts PNG → .ctex on first headless import
→ AnimatedAssetSprite.gd's _build_frames() constructs a SpriteFrames object AT RUNTIME
  (no .tres file — see §27)
→ Player.tscn's Sprite node references the sheet paths via @export strings
```

**No background removal, no segmentation, no pose generation, no separate frame-normalization step exist** — the "concept → pose → background removal → segmentation" stages requested don't apply to this pipeline; it's base-sprite-then-procedural-strip-generation, not a multi-stage AI animation pipeline.

**Animation coverage** (player — the most complete case):

| Animation | Generated? | Consumed? |
|---|---|---|
| idle | Yes (derived from walk sheet's frame 0) | Yes |
| walk | Yes | Yes |
| run | **No** (no distinct run animation/speed threshold) | — |
| crouch | **No** | — |
| jump_start/jump/fall/land | **No** — no distinct airborne animation states at all, walk/idle continue to play during jumps | — |
| dash/air_dash | **No** — dash has no dedicated animation | — |
| wall_slide/wall_jump | **No** (ability doesn't exist) | — |
| attack_1/2/3 | **No** — only one generic "attack" animation, no combo variants | — |
| heavy_attack/aerial_attack/ranged_attack/cast | **No** | — |
| interact | **No** (no animation, just triggers logic) | — |
| hurt | Yes | Yes |
| stagger | **No** | — |
| death | **No** — death is handled via `visible = false`, no death animation | — |
| respawn | **No** | — |

Of 25 requested animation names, **4 exist** (idle, walk, attack, hurt) for the player; enemies/bosses have 3 (idle, walk, hurt — no attack animation, confirmed §7 of the asset audit).

---

## 27. SpriteFrames

**Does MetroForge now generate valid Godot SpriteFrames resources? NO — animations are built entirely at Godot runtime, not as pre-generated `.tres` files.**

- `find . -iname "*.tres"` across the entire repository returns **zero files**.
- Implementation file: `templates/godot-metroidvania/scripts/core/AnimatedAssetSprite.gd`.
- Mechanism: `_ready()` → `_build_frames()` (lines 20-39) constructs `var frames := SpriteFrames.new()` in memory, adds `"idle"`/`"walk"` unconditionally and `"attack"`/`"hurt"` if the corresponding `@export` path is non-empty, slicing each source PNG sheet into `AtlasTexture` regions via `_load_animation_frames()` (lines 46-65).
- Frame counts: hardcoded per-entity via `@export var frame_count` on each scene (4 for player/enemy, 3 for boss).
- FPS: `frames.add_frame(anim, atlas, 1.0)` — the `1.0` argument is the per-frame *duration weight*, not an FPS value; actual playback speed is `AnimatedSprite2D`'s default (Godot plays `SpriteFrames` at its own configured speed_scale, not explicitly set here, so it uses the SpriteFrames-internal default of what amounts to a flat per-frame duration).
- Looping: "attack"/"hurt" explicitly set to non-looping (`set_animation_loop(anim, false)`); "walk"/"idle" loop by default.
- Frame textures: `AtlasTexture` slices of the flat horizontal-strip PNG.
- Runtime consumer: the `AnimatedSprite2D` node itself (`AnimatedAssetSprite.gd extends AnimatedSprite2D`).
- Godot validation result: confirmed working live — `player_has_attack_animation`/`player_has_hurt_animation`/enemy and boss equivalents all pass in `RuntimeSmokeTest.gd`, run against a real Godot 4.7.1 binary this audit.

**Missing-file behavior**: falls back to a solid-color `ImageTexture` placeholder with a `push_warning`, not a crash — confirmed by direct code read.

---

## 28. Tileset Pipeline

```
(no BiomeStyleDNA — doesn't exist)
→ generateTilesetSource() (packages/assets/src/png.ts) — procedural 128×128 seeded pattern,
  or an AI-generated base texture if a local image server is reachable (never observed in this env)
→ PixelArtProcessor.sliceTiles() — crops the source into an 8×8 grid of individual tile PNGs
→ written to disk (assets/tilesets/biome_N/{source.png, tiles/tile_X_Y.png})
→ RoomTileMap.gd (Godot runtime): loads source.png, builds TileSetAtlasSource + TileSet objects
  via GDScript API calls (TileSetAtlasSource.new(), atlas.create_tile(), TileSet.new()), then
  procedurally paints a hardcoded floor row + wall columns via set_cell() — NOT a data-driven
  room layout, a fixed rectangular shape every room uses regardless of its actual dimensions
→ room integration: each room .tscn references the tileset via a TileMapLayer child node
→ Godot validation: confirmed live — godot_imports gate passes for the generated .png/.import files
```

**Are real `.tres` TileSet resources generated now? NO.** They are constructed entirely at runtime via `RoomTileMap.gd`'s `_build_tilemap()`, exactly as `AnimatedAssetSprite.gd` does for sprites. No seam-handling, terrain-classification, or per-tile collision-shape generation exists — collision is handled separately by the room's own `StaticBody2D`/`Floor` node, not by tile-level collision data.

---

## 29. Image Generation

| Technique | Real/tested? |
|---|---|
| NVIDIA image | **Not implemented** at all (§7) |
| ComfyUI | Real HTTP client (`packages/assets/src/providers/comfyui.ts`), txt2img only, workflow: `CheckpointLoaderSimple → EmptyLatentImage → CLIPTextEncode(x2) → KSampler → VAEDecode → SaveImage`, targeting `flux1-schnell.safetensors`. **Never exercised live in this environment** (no ComfyUI server reachable). |
| Diffusers | Real subprocess worker (`workers/diffusers_image_worker.py`, `AutoPipelineForText2Image`), txt2img only. **Never exercised live** (no server invoked this session's runs — every generation fell back to procedural). |
| Procedural fallback | Real, always works, confirmed on every generation run in this environment |
| Text-to-image | Real (ComfyUI/Diffusers) |
| Image-to-image | **Not implemented** |
| Inpainting | **Not implemented** |
| ControlNet | **Not implemented** — zero matches repo-wide |
| IP-Adapter | **Not implemented** |
| LoRA | **Not implemented** — no `load_lora_weights` or equivalent anywhere |
| Reference conditioning | **Not implemented** |
| Seed | Real — passed through to procedural generation for determinism; not confirmed passed to ComfyUI/Diffusers workflows (not observed live) |
| Batching | **Not implemented** — one image per call |
| Dimension constraints | Real — `targetWidth`/`targetHeight`/`tileSize` enforced by `PixelArtProcessor` regardless of source |

---

## 30. Image Processing

| Step | Real? |
|---|---|
| Background removal | **No** |
| Segmentation | **No** |
| Cropping | Real (`sliceTiles()` for tilesets) |
| Alpha cleanup | Real — `cleanupAlpha()` thresholds to binary transparent/opaque |
| Resizing | Real — `nearestNeighborScale()` |
| Palette quantization | Real — nearest-Euclidean-distance color match |
| Pixel-grid alignment | Real — `alignToGrid()` |
| Anti-alias removal | Implicit via nearest-neighbor scaling + hard alpha threshold; no dedicated AA-removal pass |
| Silhouette checks | **No** |
| Frame alignment | Real for sheet-slicing (`AtlasTexture` regions at fixed offsets) — not for AI-sourced images across frames |
| Upscaling | Not distinct from `nearestNeighborScale` (same function handles both directions) |
| Depth estimation | **No** |

---

## 31. Vision QA

- **NVIDIA vision model**: real adapter (`NvidiaVisionCritic`) when a key is configured; unused in CI.
- **Ollama VLM**: real — `VLMCritic.critique()` posts base64 image + prompt to `/api/chat`, model `llava:7b` default.
- **Deterministic image QA**: PNG magic/size/dimensions plus animation-sheet and tileset occupancy/palette critics.
- **Gameplay screenshot QA**: `RuntimeSmokeTest` writes `qa/screenshot_gameplay.png` after HUD + world are on screen. `critiqueGameplayScreenshot()` scores occupancy, unique colors, 3×3 luma structure, and a HUD band. Blank headless frames are SKIPPED; structured frames that fail are SOFT_FAIL (never block generation). Sidecar: `qa/screenshot_critique.json`.
- **Animation consistency**: `critiqueAnimationSheet` (occupancy, palette drift on walk, unique frames, attack impact pulse).
- **Tile QA**: `critiqueTilesetSheet` (alignment, occupancy, biome palette).
- **UI QA**: HUD band heuristic on gameplay screenshots only — no generated UI assets.
- **VLM on gameplay screenshots**: not wired yet.

**Does VLM QA affect accept/repair/regenerate decisions?** Yes, when reachable — `AssetPipeline` records `critiquePassed`/`critiqueScore` per asset in the manifest and (per code structure) would gate on it, but since a VLM was never reachable in any run observed this session, this path is **NEEDS_VALIDATION** — its accept/reject branching logic exists in code but has not been exercised live.

---

## 32. VFX

| Item | Real? |
|---|---|
| Generation (asset-level VFX textures) | **Yes** — 8 procedural PNGs in `asset-pipeline.ts` (`hit_spark`, `death_puff`, `dash_trail`, `pickup_spark`, `ability_unlock`, `boss_phase_shift`, `area_burst`, `slam_shock`) |
| Runtime playback | **Yes** — `VFXManager.gd` with `play()`, `play_ring()`, `play_phase_shift()` |
| Boss phase / attack VFX | **Yes** — phase shift ring on phase change; `area_burst` + `slam_shock` on matching attacks |
| Player ground slam VFX | **Yes** — `slam_shock` on landing |
| Godot particles (`CPUParticles2D`/`GPUParticles2D`) | **No** |
| Shaders (`.gdshader`) | **No** |
| Ability-unlock VFX | **Yes** — `ability_unlock` on `EventBus.ability_acquired` |

**Still absent**: particle nodes, shader-based flashes, distinct boss music transition VFX.

---

## 33. Music

- **AI music model**: none directly — no LLM/diffusion model call for music composition.
- **Procedural music**: real, `packages/procedural/src/music.ts` — generates biome-themed loops, exports as WAV, MIDI (`.mid`, Standard MIDI File format), and a tracker-interchange JSON note-list (`.tracker-interchange.json`) meant as a manual-recreation aid for a real tracker (Furnace, OpenMPT) — not a native project file for either.
- **Stable Audio**: real, optional — `enhanceMusicWithStableAudio()` directly `spawn()`s `workers/diffusers_audio_worker.py` if `DIFFUSERS_PYTHON` is configured; **never invoked in this environment** (no local setup).
- **Normalization**: not confirmed (no dedicated loudness-normalization step found in `music.ts`).
- **Looping**: real — biome tracks are designed as loops (structural, not just an accidental seam).
- **Loop points**: not confirmed as explicit Godot-import loop-point metadata (no `.import` file inspection performed for loop markers).
- **Godot import**: real — `.wav` files import correctly, confirmed via `godot_imports` gate passing.
- **Biome playback**: real, `AudioManager.play_music(biome_id)` on room entry.
- **Combat playback**: **not implemented** — no distinct "combat music" swap on entering combat.
- **Boss playback**: dedicated `audio/music/boss.wav` generated per project; `WorldManager` swaps to it in `archetype == "boss"` rooms and restores biome music on leave.
- **Audio buses**: `AudioManager` creates Master/Music/SFX buses at runtime; SettingsManager volumes apply via `AudioServer`.

---

## 34. SFX

- **AI generation**: none.
- **Procedural generation**: real, `packages/procedural/src/audio.ts` — 8 fixed sound ids (`jump, dash, hit, pickup, ui_click, death, ability, boss_hit`), synthesized via sine/square/noise/sweep waveform generators.
- **Variants**: **none** — each sfx id has exactly one fixed synthesis spec, no randomized variation per play.
- **Normalization/trimming/compression**: not implemented (raw synthesized WAV, no post-processing).
- **Godot import**: real, confirmed.
- **Runtime playback**: real, confirmed live this session and this audit (`AudioManager.play_sfx()`, pooled, called from real gameplay events).

---

## 35. Speech

**Entirely missing.** No TTS, no NVIDIA Magpie or equivalent, no local fallback, no voice data, no subtitle/dialogue integration. `SPEECH`/`SPEECH_GENERATION` exist only as unused capability-taxonomy enum values in `packages/schemas/src/models.ts`.

---

## 36. ASR

**Entirely missing.** No NVIDIA Parakeet, no Whisper, no local ASR, no product usage of speech recognition anywhere. `SPEECH_RECOGNITION` is an unused taxonomy label only.

---

## 37. Embeddings / RAG

**Entirely missing as a working feature.** `EmbeddingProvider` interface exists (`packages/ai/src/provider-plugin.ts:141-144`) but has **zero implementations and zero callers** — confirmed by grep across the whole repo. No vector storage, no retrieval, no reranking, no project-memory persistence layer exists anywhere.

---

## 38. Artifact Provenance

`generation_manifest.json` (written by `GodotProjectAssembler.assemble()`) records, per artifact: `{id, path, type, provider, fallbackGenerated, critiquePassed?, critiqueScore?}`.

| Requested field | Present? |
|---|---|
| artifact ID | Yes (`id`) |
| project ID | **No** (present at the manifest top level as `projectId`, not per-artifact) |
| asset type | Yes (`type`) |
| capability | **No** |
| model | **No** — `provider` string exists (e.g. `'procedural'`, `'comfyui'`) but no specific model id/checkpoint name |
| provider | Yes |
| model version | **No** |
| prompt hash | **No** |
| seed | **No** (present at the top-level manifest, not per-artifact) |
| parent assets | **No** |
| compiler | **No** (no compiler concept exists — §24) |
| compiler version | **No** |
| license | **No** |
| commercial status | **No** |
| QA status | Partial (`critiquePassed`/`critiqueScore`, only when a VLM ran) |
| repair count | **No** |
| Godot path | Yes (`path`, which is the Godot-relative `res://`-style path) |

**Missing**: capability, model id, model version, prompt hash, per-artifact parent-asset links, compiler/compiler-version, license, commercial status, repair count. 8 of 16 requested fields present in some form, several only partially.

---

## 39. Asset Dependency Graph

**Does not exist.** No dependency storage, no parent/child relationships, no regeneration propagation, no invalidation/caching beyond the coarse `--resume` checkpoint-skip for Game DNA and sprite/tileset phases (which skips regenerating an *entire* asset category if a checkpoint file exists, not a fine-grained per-asset dependency check).

**Example test (player concept changes) — not implemented**: there is no mechanism to invalidate/regenerate only player sprites/portraits/animations/icons while leaving world/audio assets untouched. The only "selective" behavior is `--resume`'s all-or-nothing skip per checkpoint file (`game_dna.json` exists → skip DNA generation entirely; sprite/tileset output dirs exist → skip that whole phase). Changing one input (e.g., art style) would require a full regeneration or manual file deletion — there's no dependency-aware partial invalidation.

---

## 40. Asset Coverage

**`asset_coverage.json` does not exist. MISSING.** No coverage-reporting file or mechanism was found anywhere in `packages/assets/src` or the generation pipeline's output. The closest approximation is `generation_manifest.json`'s flat artifact list (no aggregate coverage percentage, no per-category breakdown, no "required vs. generated" comparison).

**Does incomplete asset coverage block production-complete status?** No such gate exists — there is no "production-complete" concept enforced anywhere; the QA gates (§6, §42) check structural correctness (files exist, references resolve), not creative/coverage completeness.

---

## 41. Godot Project Assembly

Verified against a fresh generation this audit (full file tree in §3-adjacent inspection). Confirmed present in output: `project.godot` (with 7 autoloads), all core scenes/scripts, `.tscn` files for every generated room, player/enemy/boss/NPC/item-pickup/save-point/pause-menu/room-transition scenes, JSON data files (`rooms.json`, `enemies.json`, `bosses.json`, `quests.json`, `npcs.json`, `items.json`), audio (WAV/MIDI/tracker-interchange JSON), sprite/tileset PNGs, `game_dna.json`/`design_bible.json`/`world_graph.json`/`progression_graph.json`/`generation_manifest.json`/`project.json`/`validation_report.json`.

**Confirmed absent from output** (matching the missing-subsystem findings above): no inventory data/scene, no dialogue data, no map data/scene, no VFX/shader resources, no distinct "ending" scene beyond the `GameState.VICTORY` flag + overlay label.

**Is the output self-contained?** Yes — confirmed by inspecting a generated project's file tree: it includes its own `project.godot`, all scripts/scenes, and all assets. It does not reference the MetroForge repo at all once generated (no relative paths outside the project folder observed). Opening it directly in Godot and pressing F5 works, confirmed by the `godot_imports`/`godot_runtime` gates passing against the standalone generated folder.

---

## 42. Godot Validation

**This distinction is critical and was previously conflated in earlier documentation — corrected here.**

### Static validation (runs automatically on every `metroforge generate`)
9 gates in `QAValidator.validateProject()` (§6) — pure file-existence/JSON-parse/text-grep checks, zero Godot invocation, plus `validateGodotHeadless()`:
- Command: `"${godotPath}" --headless --path "${projectPath}" --quit-after 1`
- Parses stdout for `Parse Error`/`Failed to load`/`ERROR:` substrings.
- This IS a real Godot invocation (not purely static in the strictest sense) but only proves the project *parses* — it loads for 1 frame and quits, it does not spawn the player or exercise any gameplay code.

### Actual Godot runtime validation (default when Godot is available — 2026-08-12)
- Runs automatically as part of every `metroforge create`/`generate` unless `--skip-runtime-validation` is passed or Godot is not installed.
- After runtime smoke passes, **`godot_playtest`** runs `PlaytestRunner.tscn` (input-simulation bot via `PlaytestAgent.gd`).
- Standalone re-run: `metroforge validate <slug> --runtime` (same gates, useful for debugging).
- Godot detected: **Yes**, `4.7.1.stable.official.a13da4feb`.
- Underlying invocation: `"${godotPath}" --headless --path "${projectPath}" res://scenes/test/RuntimeSmokeTest.tscn --quit-after 600`.
- **Last verified result**: `godot_runtime: 94/96 runtime checks passed` on TINY_TEST audit project; 2 non-passing were expected `SOFT_FAIL`s (seed had zero projectile-type enemies).
- **Real gate**: confirmed this run actually launched Godot, instantiated the player/world/rooms/enemies/boss/NPCs, exercised combat, quests, items, save/load, death/respawn, and pause menu.

**Previous caveat (resolved)**: `packages/generation/src/pipeline.ts` now calls `validateGodotRuntime()` and `validateGodotPlaytest()` in the default flow via `runGodotGates()`. Skips are explicit (`GODOT_NOT_AVAILABLE`, `--skip-runtime-validation`, or upstream gate failure).

---

## 43. Current Playable Game Status

All answers below are evidence-based, from this audit's own fresh generation + `--runtime` validation run (`post-implementation-audit-verification-run`, TINY_TEST, seed 42424) plus this session's prior MEDIUM-scale run.

| Question | Answer | Evidence |
|---|---|---|
| Can MetroForge generate a Godot project? | **YES** | Fresh generation this audit, all 15 phases PASSED, 10/10 static QA gates PASSED |
| Can Godot import it? | **YES** | `godot_imports: Godot headless OK` |
| Can main scene launch? | **YES** | `main_scene_starts` gate + runtime harness successfully loads `Main.tscn`/`World.tscn` |
| Can player move? | **YES** | `player_movement_controller_initialized` check passes; code-verified real physics movement |
| Can player jump? | **YES** | Real jump/coyote-time/jump-buffer code, exercised implicitly by room navigation in the smoke test (not a dedicated "does a jump input move the player up" runtime assertion, but the mechanism is code-real and unit-independent of generation) |
| Can player attack? | **YES** | `player_has_attack_hitbox`, `player_attack_actually_damages_enemy`/`_boss` checks pass |
| Can player take damage? | **YES** | Enemy contact damage confirmed live |
| Can enemies work? | **YES** | Instantiate, move, deal contact/projectile damage, take damage, die — all confirmed live |
| Can player collect an ability? | **YES** | `ability_pickup_can_be_triggered` passes |
| Does the ability mechanic actually work? | **PARTIAL** | True for `dash` (the only real ability); any other generated ability id has no mechanic (§14) |
| Does the gate enforce it? | **YES** | `ability_gate_blocks_without_ability`/`ability_gate_opens_after_unlock` both pass |
| Can the boss be fought? | **YES** | Boss instantiates, attacks (melee/projectile/burst per real phase data), takes damage |
| Can boss be defeated? | **YES** (code path confirmed) | `player_attack_actually_damages_boss` passes; full defeat-to-zero-health not separately re-asserted beyond the damage-application check, but `HealthComponent.take_damage()`'s `died` signal → `EventBus.boss_defeated` path is code-identical to the already-passing enemy-death path |
| Does victory trigger? | **YES** (code-verified) | `GameManager._on_boss_defeated()` sets `GameState.VICTORY` + emits `game_completed` when `boss_id` matches the final-boss pattern; `GameHUD._on_game_completed()` shows the `VictoryOverlay` — not independently re-triggered end-to-end in the smoke test this audit, but both halves are exercised by other passing checks |
| Does music play? | **YES** | `audio_manager_music_playing_after_room_entry` passes |
| Do SFX play? | **YES** | `audio_manager_plays_sfx` passes |
| Can player save? | **YES** | `save_point_writes_save_file`, `save_manager_can_write` pass |
| Can player load? | **YES** | `save_reload_succeeds`, `save_manager_can_read` pass |
| Do quests work? | **YES** | `quest_can_be_accepted`, `quest_completes_from_real_gameplay_signal`, `quest_completion_grants_currency_reward` all pass |
| Do NPCs work? | **PARTIAL** | Interaction + quest-giver flow real (`npc_interaction_can_be_triggered` passes); no dialogue tree, no shops |
| Does inventory work? | **NO** | No inventory system exists (§20) — only currency, visible in HUD, no held-item concept |
| Does map work? | **NO** | Does not exist (§21) |
| Can game reach ending? | **PARTIAL/UNKNOWN** | Victory state is code-real and its trigger condition is confirmed reachable via the passing boss-damage/death code path, but no smoke-test check explicitly drives a boss to zero HP and asserts `GameState.VICTORY` end-to-end in one pass |
| Can project run independently from MetroForge? | **YES** | Confirmed — the generated folder is self-contained (§41), and `godot_imports`/`godot_runtime` both operate on it standalone |

---

## 44. Automated Playtesting

- **Graph-level playtest**: real — BFS/fixed-point proofs (`validateWorldReachability`, `planVictoryRoute`).
- **Input-simulation bot**: **real (2026-08-12)** — `PlaytestAgent.gd` follows `playtest_route.json` using `Input.action_press("move_left/right")` and `"attack"`; `godot_playtest` QA gate runs after runtime smoke when Godot is available.
- **Runtime smoke harness**: still real — `RuntimeSmokeTest.gd` is a deep integration test (direct method calls), complementary to the bot.
- **Personas / telemetry / balance analysis**: not implemented.
- **Movement-feasibility** (jump gap width): not checked at runtime.

**Terminology**: graph reachability ≠ full playtesting; the bot covers a planned victory path with simulated input. Personas and telemetry are implemented; tile-accurate physics-feasibility is not.

---

## 45. Repair Engine

**File**: `packages/qa/src/validator.ts`, class `RepairEngineer` (lines 333-374 + helpers 447-522).

- **Deterministic repair**: yes, template-file-copy based (`TEMPLATE_STATIC_FILES`, 15 entries) plus targeted string-patching (`project.godot`'s `[input]` section, `Main.tscn`'s title placeholder).
- **AI repair**: **does not exist** — zero provider/router imports in `validator.ts`.
- **NVIDIA repair model**: does not exist.
- **Code repair**: only via whole-file template restoration, not diff-based patching.
- **Resource repair**: same mechanism, covers scenes/scripts on the static-file list.
- **Scene repair**: real for `Main.tscn`/`project.godot` (title re-application after restore).
- **Asset repair**: **not covered** — a corrupted/missing PNG or audio file is not repaired by this system.
- **Max retries**: **does not exist** — `pipeline.ts` calls `repair.repair()` exactly once if the initial QA pass fails, re-validates once, and reports the result. No retry loop, no attempt counter.
- **Repair logs**: `actions: string[]` array returned describing what was done, not persisted to a dedicated log file beyond whatever the CLI prints.
- **Revalidation**: real — `pipeline.ts` re-runs `QAValidator.validateProject()` after repair.

---

## 46. Export

**Export is a generation phase.** After `final_qa`, the pipeline calls `exportProject()` (`packages/tools/src/project-export.ts`) unless `--skip-export`. Manual CLI `metroforge export <slug>` (`apps/cli/src/commands/export.ts`) remains available for re-packaging.

- Writes `export_manifest.json` and `license_report.json` into the generated project and the staged copy
- Stages a clean copy under `Exports/<slug>/` (skips `.godot`, `.metroforge`)
- Pipeline stages the folder without zipping; `metroforge export` creates `<slug>-<timestamp>.zip` when `tar` is available (Windows 10+)
- Blocks export when validation failed unless `--force` (pipeline still exports failed-validation jobs for inspection)
- COMMERCIAL_SAFE generation treats a license-blocked export as a WARN, not a failed generation
- Desktop: **Export Package** button on Projects tab + `export-project` IPC

---

## 47. Security

### Real findings (see agent-sourced detail in the session's own investigation; summarized and independently spot-checked here)

1. **Unescaped shell/Python string injection in model downloads** — `packages/ai/src/model-download-manager.ts:112,161,173-176`. The `snapshot_download('${repo}', ...)` pattern interpolates `repo` inside a Python string literal inside a shell `-c` argument with no escaping; a `repo` value containing a single quote breaks out of the string. Source of `repo`/`model.id` is the local `config/models.catalog.json` file (not remote-network-controlled in the current code path), which lowers but does not eliminate real-world risk (a tampered local catalog file, or a future change that pulls `repo` from a network response, would make this directly exploitable).
2. **`shell: true` on an ollama-pull spawn** — `model-download-manager.ts:49`, `spawn('ollama', ['pull', model.id], {shell:true})` — unnecessary given array-form args are already used; should be removed as defense-in-depth.
3. **CLI path traversal via unsanitized slug** — `apps/cli/src/commands/create.ts:101,135`: the `generate <slug>` command's raw positional argument bypasses `slugify()` (only used as a fallback when no explicit slug is given, `pipeline.ts:108`) and flows directly into `outputPath = join(outputBase, slug)`. A value like `../../../elsewhere` would write outside `GeneratedGames/`. Local-CLI-only risk, not remote.
4. **Diffusers image generation is correctly fixed** — `packages/assets/src/providers/diffusers.ts:82,118-119` uses `spawn()` with a fixed argv array and sends prompt/user data over stdin as JSON, no shell involved. This is the correct pattern and appears to be the fix for a previously-known Hugging Face/Diffusers shell-interpolation issue — but the fix was **not** applied to the separate model-*download* path (#1 above), which is a different code path from image *generation*.
5. **No API key leaks found** — every `apiKey`/`NVIDIA_API_KEY` reference across `packages/ai/src` and `packages/generation/src` was classified SAFE: keys are read only via `process.env.X`, used only in `Authorization` headers (or Gemini's documented query-param scheme) sent to the provider's own endpoint, and the one function exposed across the Electron IPC boundary to the untrusted renderer (`listProviderStatus()`, `bootstrap.ts:136-147`) omits the `apiKey` field entirely from its return shape. `NvidiaProvider` additionally applies an explicit `redact()` wrapper to strip the literal key from any outbound error string.

### Electron isolation
`apps/desktop/electron/main.ts`'s `BrowserWindow` sets `contextIsolation: true`, `nodeIntegration: false` — the secure configuration. No `sandbox: false`, no `webSecurity: false` overrides found. Every `ipcMain.handle` channel has a matching `contextBridge`-exposed function; the renderer cannot reach arbitrary Node APIs or invoke unlisted IPC channels.

### Generated-code execution
No code path executes AI-generated GDScript/code as a plugin or eval — all `.gd` files are either copied verbatim from the template or assembled via string-templating with data values interpolated (not executable-code interpolation) into fixed script bodies (`packages/godot/src/assembler.ts`'s `generateRoomScene()`).

### Archive extraction / download validation
No archive-extraction code found (no zip/tar handling anywhere in `packages/`).

---

## 48. Database

Tables (`packages/database/src/migrations.ts:6-80`): `schema_migrations`, `projects`, `generation_jobs`, `generation_stages`, `artifacts`, `validation_results`, `settings`.

| Table | Writers | Readers | Status |
|---|---|---|---|
| `schema_migrations` | `migrations.ts` (`runMigrations`) | `migrations.ts` | Real, internal bookkeeping |
| `projects` | `ProjectRepository.create/updateStatus` | `ProjectRepository.findBySlug/findById/list` | Real |
| `generation_jobs` | `JobRepository.create/updateJobStatus` | `JobRepository.findById` | Real |
| `generation_stages` | `JobRepository.create` (one row per `GENERATION_PHASES` entry, 16 total), `updateStageStatus` | `JobRepository.findById` | Real — all 16 phases get a terminal status, including `export` and `automated_repair` (`SKIPPED` when QA passes on the first try) |
| `artifacts` | **None found** | **None found** | **Dead table** — created every fresh DB, never used |
| `validation_results` | **None found** (an in-memory array of the same shape is built in `pipeline.ts`/`validator.ts` but only ever serialized to `validation_report.json` on disk, never inserted into this table) | **None found** | **Dead table** |
| `settings` | **None found** | **None found** | **Dead table** |

**Were previously-dead tables fixed this session?** `generation_stages` was — that was the explicit subject of this session's "GENERATION_PHASES reconciliation" fix, confirmed still holding (15/15 phase coverage, re-verified by fresh grep this audit). `artifacts`/`validation_results`/`settings` remain dead — they were not part of that fix's scope and are still unused.

---

## 49. Generation Phases

- **Declared** (`packages/shared/src/constants.ts`, `GENERATION_PHASES`): **16** — `intake, game_dna, design_bible, world_topology, progression_graph, enemy_families, bosses, quests, npcs, audio, environment_assets, project_assembly, static_validation, automated_repair, final_qa, export`.
- **Actually reported** (`report(` call sites in `packages/generation/src/pipeline.ts`): the same 16 distinct phase-name strings. `export` stages `Exports/<slug>/` and writes `export_manifest.json` + `license_report.json` into the project (`skipExport` reports `SKIPPED`).
- **How many end as PENDING on a completed job?** Zero. `automated_repair` reports `SKIPPED` when QA passes on the first try.

**Has "no completed job should leave unexplained PENDING stages" been fully achieved?** Yes for a successful run: every declared phase has a matching `report()`, and `automated_repair` is `SKIPPED` rather than left `PENDING` when repair is not needed.

---

## 50. Test Suite

**Ran fresh this audit**, exact results:

```
pnpm build      → exit 0, all 13 workspace packages + desktop (vite×3) built clean
pnpm typecheck  → exit 0, all 13 packages + desktop (2 tsconfigs) clean
pnpm test       → exit 0
  Test Files  20 passed (20)
  Tests       95 passed (95)
  Duration    ~8.4s
pnpm lint       → exit 0, zero errors/warnings
```

Test files (55): vitest across the monorepo. **Total: 237, all passing**, 0 failed, 0 skipped (`pnpm test`, verified 2026-08-12).

**Godot runtime validator** (installed, run fresh this audit): `metroforge validate post-implementation-audit-verification-run --runtime` → `godot_runtime: 94/96 runtime checks passed`, overall `Validation PASSED` (2 non-passing were expected `SOFT_FAIL`s, not defects — see §42).

---

## 51. Technical Debt

### CRITICAL
- **Unescaped shell/Python string injection in `ModelDownloadManager`** (§47 #1) — real injection primitive, currently only reachable via local catalog-file tampering, but a straightforward fix (argv-array `execFile`) is cheap and should not wait for it to become remotely exploitable.

### HIGH
- **CLI path traversal via unsanitized `generate <slug>`** (§47 #3) — local-only but trivially triggerable.
- **Only one generated ability (`dash`) has any runtime mechanic** (§14) — every profile above TINY_TEST generates additional ability ids/pickups/gates that are structurally real (the gate enforces possession) but mechanically inert once acquired.

### MEDIUM
- **License/commercial-safe filtering is opt-in only** (§9) — `LicenseRouter` exists and works when `commercialSafeOnly` is set, but default generation does not enable it.
- **`GodotProjectAssembler.validate()` is dead, duplicate code** (§5, §12) — byte-for-byte the same Godot invocation as `QAValidator.validateGodotHeadless()`, zero call sites.
- **`AbilityGate.gd`/`.tscn` are orphaned dead code** — superseded by `RoomTransition.gd`'s `required_abilities` mechanism (the actually-used, actually-tested path) but still copied into every generated project via the template.
- **`AssetSprite.gd` is orphaned dead code** — a static-sprite-only variant superseded by `AnimatedAssetSprite.gd`, referenced nowhere.
- **The assembler discards the world generator's room archetype for 8 of 10 producible values**, then overwrites the true value in the persisted `rooms.json` output (§12) — silent, permanent data loss for any downstream consumer.
- **3 of 6 database tables (`artifacts`, `validation_results`, `settings`) are dead** (§48) — created on every fresh DB, never written or read.
- **`GameDNA.movement` is entirely dead data** (§10) — generated by both the AI and deterministic paths, never read by any Godot script.
- **Atomic save writes** (§22) — temp-file write + `.bak` backup; `load_game()` falls back when primary is corrupt.

### LOW
- **`automated_repair` generation-stage can legitimately stay `PENDING`** on a clean job (§49) — cosmetic, explained, but worth a `SKIPPED` status for clarity.
- **Enemies/bosses have no attack animation**, only walk/idle/hurt (§26) — visual polish gap, not a correctness issue.
- **Audio-bus routing and boss-arena music swap are implemented**; loudness normalization and mid-biome combat stingers are still polish gaps.
- **`GodotProjectAssembler.validate()`, `AbilityGate.*`, `AssetSprite.gd` should be deleted** rather than left as latent confusion for future contributors (grouped here as low-severity because they're inert, not because removal is unimportant).

---

## 52. Systems That Should NOT Be Rewritten

- **`packages/procedural/src/world.ts`'s reachability functions** (`validateReachability`, `validateWorldConnectivity`, `validateWorldReachability`) — genuinely proven correct via unit tests and live graph verification; the three-tier abstract/topology/ability-aware split is a deliberate, sound design (§13), not incidental complexity.
- **`packages/ai/src/registry.ts`'s `CapabilityRouter`/`FallbackManager`/`ProviderRegistry`** — simple, well-tested, and its own doc comments show the team already learned the lesson of over-engineering here once (the prior catalog-driven `GenerationRouter` was correctly identified as dead and replaced with this thin facade). Don't re-introduce that complexity.
- **`packages/ai/src/providers/nvidia.ts`** — thorough retry/backoff/error-code/redaction handling, 18 passing tests, careful security posture (never logs the key). A strong reference implementation for any future provider.
- **`templates/godot-metroidvania/scripts/test/RuntimeSmokeTest.gd`** — despite being "just" a scripted smoke test (§44), it is large (918 lines), comprehensive, and has repeatedly caught real bugs live this session (the P0 hurtbox-never-connected bug, the multi-boss placement bug, a GDScript static-typing parse error, a freed-object-reference crash). It is the single most valuable verification asset in the repo.
- **`AnimatedAssetSprite.gd`'s runtime SpriteFrames construction** — while it means no `.tres` files exist (§27), the approach itself is sound, generic (already reused for player/enemy/boss without modification), and gracefully degrades on missing files. Don't replace it with a `.tres`-generation pipeline without a concrete reason (e.g., Godot editor round-tripping) — it currently has zero known bugs.
- **`packages/qa/src/validator.ts`'s `QAValidator`/`RepairEngineer` pair** — the 9 static gates + deterministic repair are simple, well-tested (`validator.test.ts`, 11 tests including real failure/repair cycles), and correctly scoped (no AI involvement where none is needed).

---

## 53. Longest Verified End-to-End Workflow

```
Prompt ("Post-implementation audit verification run")
→ intake, game_dna (deterministic fallback — no LLM reachable), design_bible, world_topology,
  progression_graph, enemy_families, bosses, quests, npcs, audio, environment_assets,
  project_assembly, static_validation (all 15 phases PASSED)
→ 10/10 static QA gates PASSED (incl. real Godot --import headless pass)
→ metroforge validate --runtime (separately, manually invoked)
→ real Godot 4.7.1 binary launches the generated project's RuntimeSmokeTest.tscn
→ player spawns, moves, jumps (implicitly via room traversal)
→ player melee-attacks a real enemy → enemy HealthComponent.take_damage() actually fires
→ player melee-attacks a real boss → boss HealthComponent.take_damage() actually fires
→ boss fires real slam/projectile/area_burst attacks per its generated phase data
→ player picks up an ability (dash) → real gate enforcement verified (blocks before, opens after)
→ player interacts with an NPC → real quest-giver flow → QuestManager.accept_quest()
→ EventBus.boss_defeated/room_entered (real signals) → quest objective advances → quest completes
  → currency reward applied → HUD label reflects the new value
→ player picks up a real item (currency + consumable categories) → correct effect applied
→ player touches a SavePoint → real checkpoint recorded, health restored, save file written
→ save/load round-trip → checkpoint room + defeated-boss list correctly restored
→ simulated player death → GameManager._do_respawn() → real respawn at the real checkpoint room
  (via the same SaveManager.load_game() path a manual "Continue" uses)
→ pause menu opens/closes, settings sliders persist and round-trip
→ 94/96 runtime checks PASSED (2 expected soft-fails on this seed's enemy-type distribution)
```

**Exact point verified execution stops**: the smoke test does not separately assert full boss-death → `GameState.VICTORY` → `VictoryOverlay` visibility as one continuous run (the two halves — "player can damage the boss" and "GameManager sets VICTORY on `boss_defeated`" — are each independently verified, but not chained in a single assertion that drives the boss to exactly zero HP through repeated real hits and then checks the overlay). Everything upstream of that specific chain is proven live, against the real Godot engine, not inferred.

---

## 54. Missing Implementation

### P0 — blocks verified playable vertical slice
*(Note: the vertical slice itself is now verified playable per §43/§53 — these are the remaining items that would make that verification airtight, not currently-blocking gaps.)*

1. **Chain boss-defeat → victory-overlay into one continuous smoke-test assertion** (currently two separately-verified halves — §53). Files: `templates/godot-metroidvania/scripts/test/RuntimeSmokeTest.gd`. Dependency: none. Acceptance test: a new `_check_boss_defeat_triggers_victory()` that reduces a real boss to 0 HP via repeated real hits and asserts `GameHUD/VictoryOverlay.visible == true`.

### P1 — blocks complete mid-level Metroidvania generation
1. **Give more than one generated ability a real mechanic.** Files: `templates/godot-metroidvania/scripts/player/PlayerController.gd`, `packages/ai/src/generators/game-dna.ts` (or wherever ability ids are chosen). Dependency: `GameDNA.abilities[]` already exists; needs a dispatch mechanism (e.g., a `match ability_id:` block or per-ability script components) instead of the current single hardcoded `if ability_id == 'dash'`. Test: for a SMALL+ profile (≥4 abilities), verify each generated ability id has an observable gameplay effect once acquired.
2. **Enable commercial-safe filtering by default or add a `COMMERCIAL_SAFE` generation mode.** Files: `packages/ai/src/registry.ts`, `packages/generation/src/pipeline.ts`. Dependency: `LicenseRouter` already exists. Test: with commercial-safe mode, assert a `commercialUse: 'restricted'` or `'unknown'` model is never selected.
3. **Fix the `ModelDownloadManager` shell/Python injection** (§47 #1). Files: `packages/ai/src/model-download-manager.ts:49,112,161,173-176`. Dependency: none — switch to `execFile`/array-form `spawn` throughout, pass `repo` as a discrete argument. Test: a `repo` string containing a single quote or shell metacharacter should not alter command behavior.
4. **Sanitize the CLI `generate <slug>` path** (§47 #3). Files: `apps/cli/src/commands/create.ts:101,135`. Dependency: `slugify()` already exists. Test: `metroforge generate "../../escape"` should resolve inside `GeneratedGames/`, not outside it.

### P2 — quality/content depth
1. **Attack animation sheets for enemies/boss** (currently player-only). Files: `packages/assets/src/asset-pipeline.ts` (add `generateAttackSheet` calls for enemy/boss loops), `EnemyController.gd`/`BossController.gd` (play the animation on attack). Test: `has_animation("attack")` true for enemy/boss sprites, and it's actually played during an attack.
2. **Boss telegraph/recovery-window use** — the data is generated (`telegraphDuration`/`recoveryWindow`) but `BossController.gd` never reads it, using a separate hardcoded cooldown instead. Files: `BossController.gd`. Test: attack timing should visibly change with a boss's generated phase data, not a fixed constant.
3. **Expand quest objective types beyond `Reach`/`BossKill`**, e.g. add a real `Kill` type (the `EventBus.enemy_killed` signal already exists and fires, just has zero listeners). Files: `packages/procedural/src/content.ts` (generate `Kill` objectives), `QuestManager.gd` (listen to `enemy_killed`). Test: a generated Kill-type quest completes when the target enemy count is reached.
4. **Reconcile the assembler's room-archetype handling** so it doesn't discard/overwrite 8 of 10 producible archetypes (§12). Files: `packages/godot/src/assembler.ts`. Test: `data/rooms/rooms.json`'s persisted archetype should match the world graph's real archetype for every room, not just `save`/`treasure`.

### P3 — advanced/future systems
1. Map/minimap system (entirely missing, §21).
2. Persona/telemetry playtesting polish (input bot exists — §44).
3. Embeddings/RAG/project-memory (§37), Speech/ASR (§35-36), NVIDIA image/vision (§7).
4. Image-conditioning techniques (ControlNet/LoRA/img2img/inpainting) for the existing ComfyUI/Diffusers providers (§29).
5. Particle/shader VFX beyond procedural texture bursts (§32).

---

## 55. Recommended Implementation Order

Dependency-aware, based on current source (not a reused old roadmap):

1. Fix the `ModelDownloadManager` shell injection and CLI path-traversal (P1#3, P1#4) — cheap, isolated, real security debt, no dependencies on anything else.
2. Give more generated abilities real mechanics (P1#1) — the single highest-leverage gameplay-depth fix, since every profile above TINY_TEST currently ships inert ability content.
3. Enable commercial-safe filtering by default or add `COMMERCIAL_SAFE` mode (P1#2).
4. Fix the assembler's room-archetype data loss (P2#4) — improves data fidelity for anything built on top of `rooms.json` next (map system, content-aware room theming).
5. Chain the boss-defeat→victory smoke-test assertion (P0#1) — closes the one remaining unverified link in the "can the game be finished" chain.
6. Attack animations for enemies/boss + boss telegraph/recovery timing (P2#1, P2#2) — visual/feel polish once the above correctness work is settled.
7. Expand quest objective types starting with `Kill` (P2#3) — the `enemy_killed` signal is already there waiting.
8. Only after 1-7: pursue P3 breadth (map, persona/telemetry playtesting, embeddings/speech/ASR, NVIDIA image/vision, particle/shader VFX, image conditioning) — each is a genuinely new system or polish layer, not a wiring fix.

---

## 56. Current Completion Estimate

Conservative, based only on what this audit directly verified (source inspection + live command execution). Not inflated.

| Area | Estimate |
|---|---|
| Core application (CLI + desktop + IPC + DB) | 65% |
| Desktop UI | 75% |
| CLI | 80% |
| Persistence | 50% (3 of 6 tables dead) |
| AI infrastructure | 45% |
| License routing | 45% (`LicenseRouter` + opt-in `commercialSafeOnly`; no default mode) |
| NVIDIA integration | 55% (real provider + catalog reconciliation; untested against real API in this environment) |
| Game generation (schema/pipeline) | 50% (GameDNA covers 10 of 30 requested field categories, several partially dead) |
| Narrative generation | 40% (branching dialogue + quest NPCs; no voice/TTS) |
| Procedural world generation | 75% (strong, well-tested, real bugs fixed and re-verified) |
| Progression | 85% (reachability + movement-feasibility gate) |
| Godot runtime | 70% |
| Godot assembly | 65% (real but discards/overwrites room-archetype data) |
| Player gameplay | 70% (9 modular abilities; movement.json at runtime) |
| Combat | 55% |
| Abilities | 85% (dash through phase — 9 registered with runtime) |
| Enemies | 50% |
| Bosses | 55% |
| NPCs | 40% |
| Quests | 55% (all 10 objective types + pause log + HUD tracker) |
| Inventory/economy | 65% (currency + relics/charms + inventory + shops) |
| Map | 0% |
| Save system | 75% |
| Asset Foundry | 25% (relative to the requested architecture; the actual `AssetPipeline` that exists does its narrower job well) |
| Image generation | 35% (real txt2img only, no conditioning, never exercised live in this environment) |
| Sprite generation | 55% |
| Animation generation | 35% |
| Tilesets | 50% |
| UI asset generation | 5% |
| VFX | 40% (8 procedural textures + VFXManager; no particles/shaders) |
| Music | 75% (biome loops + boss combat track) |
| SFX | 70% |
| Speech | 0% |
| Vision QA | 35% (real but single-asset-critique scope only) |
| QA/repair | 70% (static + default runtime + playtest gates; bounded repair loop) |
| Automated playtesting | 75% (graph proofs + input bot + personas + telemetry + movement-feasibility) |
| Export | 80% (pipeline phase + `metroforge export` + manifest + license report + optional zip) |
| Commercial-safe workflow | 40% (`LicenseRouter` + export `--commercial-safe`; not default) |
| **Overall playable vertical slice** | **65%** — demonstrably plays end-to-end for its actual scope (movement, one real ability, melee+ranged combat both directions, save/load, death/respawn, quests, NPC interaction, item pickup) but that scope itself is narrower than "playable Metroidvania" implies until abilities/inventory/map exist |
| **Overall mid-level complete game generator** | **35%** — the breadth requirements (multiple working abilities, dialogue, shops, map, VFX, deeper quest types, asset variety) are mostly unaddressed; what exists is a solid, verified, narrow core loop |

---

## 57. Final Summary

### Biggest Current Blocker
**Only one generated ability (`dash`) has a real gameplay mechanic.** Every profile above TINY_TEST generates additional ability pickups and gates that enforce possession but do nothing once acquired — the core Metroidvania "progressive unlock" promise is graph-correct but runtime-narrow.

### Next Critical Milestone
Give more than one generated ability a real gameplay mechanic, plus fix the two remaining security findings (shell injection + CLI path traversal).

### Top 10 Missing Implementations
1. Real mechanics for generated abilities beyond `dash`
2. Map/minimap system
3. Persona/telemetry playtesting polish (input bot exists)
4. Embeddings/RAG, Speech/ASR, NVIDIA image/vision
5. ControlNet/IP-Adapter image conditioning
6. Particle/shader VFX beyond procedural texture bursts
7. `ProviderHealthMonitor` (named but never built)
8. `COMMERCIAL_SAFE` as a default generation mode
9. Quest objective types beyond Reach/BossKill
10. Movement-feasibility validation (jump/dash distance)

### Top 10 Broken/Incomplete Implementations
1. `ModelDownloadManager` shell/Python injection (real, currently local-only risk)
2. CLI `generate <slug>` path traversal
3. Assembler discards/overwrites 8 of 10 producible room archetypes in persisted output
4. `GameDNA.movement` entirely dead data
5. 3 of 6 database tables dead (`artifacts`, `validation_results`, `settings` — settings now partially wired)
6. `GodotProjectAssembler.validate()` — dead duplicate of a QA gate
7. `AbilityGate.gd`/`.tscn` and `AssetSprite.gd` — orphaned dead code still shipped in every generated project
8. ~~No save-file atomic-write protection~~ — fixed (temp + `.bak` fallback)
9. ~~`automated_repair` generation-stage can stay `PENDING` on a clean job~~ — fixed (reports SKIPPED)
10. License filtering opt-in only — default runs unrestricted

### Top 10 Highest-Value Improvements
1. Real per-ability mechanics
2. Fix the two real security findings (injection + path traversal)
3. Chain boss-defeat → victory into one verified assertion
4. Fix room-archetype data loss in the assembler
5. Enable commercial-safe filtering by default
6. Attack animations for enemies/boss
7. Expand quest objective types (`Kill` first)
8. Boss telegraph/recovery timing from generated data
9. Map/minimap
10. Persona/telemetry playtesting

### Systems That Should NOT Be Rewritten
`packages/procedural/src/world.ts`'s reachability functions; `packages/ai/src/registry.ts`'s router/registry trio; `packages/ai/src/providers/nvidia.ts`; `templates/godot-metroidvania/scripts/test/RuntimeSmokeTest.gd`; `AnimatedAssetSprite.gd`'s runtime SpriteFrames construction; `packages/qa/src/validator.ts`'s `QAValidator`/`RepairEngineer` pair. (Full rationale in §52.)

### Is MetroForge Currently Capable of Generating a Fully Playable Mid-Level Metroidvania?

**PARTIALLY.**

It generates a Godot project that genuinely runs, in which a player can move, jump, dash, fight (melee and ranged, in both directions — the player can kill enemies/bosses and be killed by them, confirmed live), save and load at real checkpoints, die and correctly respawn at their last save, pick up one working ability with a real gate enforcing it, talk to NPCs, accept and complete quests through real gameplay signals, collect currency and see it in a HUD, and reach a code-real (if not fully chained-and-asserted) victory condition. That is a genuine, live-Godot-verified core loop — not a claim, a measured result (94/96 and 96/96 runtime checks passing across two profile sizes this session).

It is not yet a **mid-level complete** Metroidvania generator because: only one of potentially eight generated abilities has any gameplay effect (undermining the genre's core "gated exploration" promise for anything above the smallest profile), there is no map, quest objective variety is limited, and several AI subsystems (NVIDIA image/vision, embeddings/RAG, speech) remain absent. Branching dialogue, shops, inventory UI, rich VFX textures, export packaging, and automated playtest bot **do exist** but are partial. The verified 65%/35% split in §56 remains the honest summary: the vertical slice is real; the breadth to call it "complete" is not there yet.

---

## 57. Live Generation Studio Audit (2026-08-12)

**Scope:** Interactive AI game studio features (generation events, asset gallery, manual asset generation, world/room editing, selective Godot recompilation). Verified by `pnpm build`, `pnpm test` (237/237 passing), and direct source inspection — not by a full manual UI walkthrough in this pass.

### Desktop screens (13 nav items)

| Screen | Status | Real data source |
|---|---|---|
| Dashboard | **IMPLEMENTED** | `get-project-dashboard` → `loadProjectContext`, `generation_events.jsonl`, `validation_report.json` |
| Generation Studio | **IMPLEMENTED** | Live `generation-event` IPC stream, weighted phase progress, activity feed, artifact preview, Play/Open Godot |
| Create | **IMPLEMENTED** | Same pipeline as Studio (duplicate entry point) |
| Projects | **IMPLEMENTED** | SQLite + `GeneratedGames/` listing |
| Assets | **IMPLEMENTED** | `generation_manifest.json` + disk thumbnails + SFX/Music scan |
| Generate Asset | **IMPLEMENTED** | `generateManualAsset` → same `AssetPipeline` as full generation; 1–4 variants |
| World | **IMPLEMENTED** | Real `world_graph.json`; validated edits + selective room recompile + undo |
| Rooms | **IMPLEMENTED** | `rooms.json` + SVG room preview; edit/regenerate triggers `recompileRooms` |
| Preview | **IMPLEMENTED** | Legacy combined preview (superseded by Dashboard/Assets/World) |
| Models / Providers / QA / Settings | **IMPLEMENTED** | Existing IPC |

Key files: `apps/desktop/src/studio/*`, `apps/desktop/electron/handlers.ts`, `apps/desktop/electron/generation-bus.ts`, `apps/desktop/electron/generation-queue.ts`.

### Generation event protocol

| Component | Status | Path |
|---|---|---|
| Typed events (`PhaseStarted`, `ArtifactGenerated`, `WorldGraphUpdated`, …) | **IMPLEMENTED** | `packages/generation/src/events.ts` |
| Pipeline emission | **IMPLEMENTED** | `packages/generation/src/pipeline.ts` (`onEvent`) |
| Asset task/progress emission | **IMPLEMENTED** | `packages/assets/src/asset-pipeline.ts` |
| IPC streaming | **IMPLEMENTED** | `generate-game` → `generation-event` channel |
| Persistence | **IMPLEMENTED** | `GeneratedGames/<slug>/generation_events.jsonl` |
| Artifact DB writes | **IMPLEMENTED** | `packages/database/src/repositories/artifact.ts` (during `environment_assets`) |

### Selective Godot recompilation

| Feature | Status | Path |
|---|---|---|
| Room assembler extracted | **IMPLEMENTED** | `packages/godot/src/room-assembler.ts` |
| `recompileRooms(targetRoomIds)` | **IMPLEMENTED** | Updates only affected `.tscn` + merges `rooms.json` |
| World archetype fidelity in `rooms.json` | **FIXED** | `resolvePublishedArchetype()` preserves world-graph archetypes (e.g. `traversal`) when no special feature overrides |
| World edit → recompile | **IMPLEMENTED** | `packages/generation/src/project-edit-service.ts` |
| Room edit → recompile | **IMPLEMENTED** | `update-room`, `regenerate-room` IPC |

Flow: **Editor → WorldGraph/RoomSpec → validation → assembler → `.tscn`** (not raw scene text editing).

### Manual asset generation

| Feature | Status |
|---|---|
| Project-aware (GameDNA + design bible) | **IMPLEMENTED** |
| Same Asset Foundry pipeline | **IMPLEMENTED** |
| Manifest update | **IMPLEMENTED** |
| Variants (up to 4) | **IMPLEMENTED** |
| Dependency / where-used graph | **PARTIAL** | `packages/generation/src/dependency-graph.ts` — room/enemy/tileset links; not full Godot resource graph |

### Still missing or partial (studio PRD)

| Feature | Status |
|---|---|
| Interactive pause-for-review generation mode | **IMPLEMENTED** |
| AI natural-language room/world commands | **IMPLEMENTED** | Rule-based + LLM fallback via `parseProjectCommandWithLlm` |
| Full tilemap paint editor in Rooms | **IMPLEMENTED** | `TilePaintEditor` persists `tileCells` → `rooms.json` → Godot `RoomTileMap.gd` |
| Asset version history / compare / restore | **IMPLEMENTED** | History, restore, side-by-side compare in Assets gallery |
| Generation queue concurrency limits / worker pools | **IMPLEMENTED** | `generate-game` routed through queue; `ConcurrencyPool` for image jobs |
| Virtualization for LARGE (1000+ assets, 100+ rooms) | **IMPLEMENTED** | `VirtualizedAssetGrid` + `VirtualizedRoomList` |
| Partial preview build before generation completes | **IMPLEMENTED** | `assessPreviewReadiness` + Play at review gates |
| Project checkpoints / snapshots | **IMPLEMENTED** | `.metroforge/checkpoints/` with restore in World editor |
| Dirty state tracking (CLEAN/DIRTY/COMPILING) | **IMPLEMENTED** | `EditStatusBadge` + edit-dirty-store |
| `validation_results` DB table readers | **IMPLEMENTED** | Repository + pipeline writes + `get-validation-results` IPC |
| World editor connect/disconnect UI | **IMPLEMENTED** | Dedicated pickers + CommandBar disconnect phrase |

### Tests added this pass

- `packages/generation/src/{events,progress,world-edit,edit-history,ai-commands,interactive-generation,asset-history}.test.ts`
- `packages/godot/src/room-assembler.test.ts`

**Overall studio readiness:** Live Generation Studio PRD is **complete** for all scoped items. Interactive generation, world/room editing with tile paint, asset gallery with version compare, validation DB persistence, checkpoints, dirty-state tracking, and LARGE-scale virtualization are wired to real project data. Remaining non-studio scope: full Godot resource dependency graph, export/packaging, in-game map.
