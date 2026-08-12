# MetroForge AI — Current Build State (Technical Handoff)

**Purpose:** self-contained technical handoff for an architect with no access to prior
conversation history. Everything below was verified by direct source inspection, by running the
project's own build/test/lint commands, and by live-generating real projects with the CLI during
this inspection pass. Where a claim could not be verified (e.g. no Godot binary in this
environment), it is marked `NEEDS_VALIDATION` / `UNKNOWN` rather than assumed.

This document describes **only what exists in source right now**. It does not describe the
project's own README/BUILD_STATUS.md claims uncritically — several of those claims are contradicted
by the code, and those contradictions are called out explicitly.

> **Post-audit update (later session, still 2026-08-11):** a real Godot 4.7.1 binary was located
> and wired in via `GODOT_EXECUTABLE`, which also surfaced and fixed a real, previously-unknown
> bug — `.env` was never actually loaded anywhere (no `dotenv`, confirmed by grep). With Godot
> genuinely reachable, the primary vertical-slice question this document could only mark
> `NEEDS_VALIDATION`/`UNKNOWN` was closed: a fresh generated project was proven, via real Godot
> execution (not just static reading), to import cleanly and run a real gameplay smoke test —
> player spawns, world/room loads, enemies/boss instantiate, an ability pickup works, and the
> ability-gated transition genuinely blocks/unblocks. See `metroforge validate <slug> --runtime`
> and `templates/godot-metroidvania/scripts/test/RuntimeSmokeTest.gd`. The SFX-never-plays finding
> below (§5, §13, §20, §30, §34, §36) was also fixed in the same follow-up work — search this
> document for "**FIXED**" to find every place a since-resolved finding is marked inline; the
> original wording is left intact around each marker so the audit trail stays accurate rather than
> silently rewritten.

Generated: 2026-08-11. Repository has no version tags; `package.json` reports `0.1.0` everywhere.

---

## 1. Repository Information

| Item | Value |
|---|---|
| Project name | `metroforge-ai` (root `package.json`), product display name "MetroForge AI" |
| Version | `0.1.0` (root and every workspace package — no package has diverged) |
| Git branch | `master` |
| Latest commit | `0ac681f` — "Initial commit: MetroForge AI monorepo" (single commit; repo history starts here) |
| Uncommitted changes at inspection time | Yes — `docs/CLAUDE_REPOSITORY_AUDIT.md`, `docs/IMPLEMENTATION_STATUS.md`, `packages/generation/src/pipeline.ts`, `packages/procedural/src/{index,world,world.test}.ts`, `packages/qa/src/{validator,validator.test}.ts` (a prior work session's fixes, not yet committed) |
| Package manager | pnpm (`pnpm-workspace.yaml`: `apps/*`, `packages/*` — 14 workspace projects). Lockfile present (`pnpm-lock.yaml`) |
| Node requirement | `>=22.5.0` (root `package.json` `engines`). Verified installed: `v24.19.0` |
| pnpm requirement | `>=9.0.0`. Verified installed: `10.15.0` |
| Python requirement | Not pinned anywhere in `package.json`/`engines`. Referenced informally for optional local workers (`workers/requirements-diffusers.txt`); `python`/`python3` auto-detected by `packages/tools/src/registry.ts`. Not installed/verified in this environment beyond detection logic. |
| Godot requirement | `.env.example`: `GODOT_VERSION=4`. Runtime template targets Godot 4.3 (`templates/godot-metroidvania/project.godot`: `config/features=PackedStringArray("4.3", "Forward Plus")`). **Godot is not installed in this inspection environment** — `godot --version` and `godot4 --version` both fail. |
| OS assumptions | Cross-platform Node code; `packages/ai/src/hardware-profiler.ts` GPU/VRAM detection is Windows-only (`wmic`, guarded by `platform() === 'win32'`) with no macOS/Linux equivalent implemented (silently returns no GPU info on those platforms). This inspection ran on Windows. |
| Build | `pnpm build` → `pnpm -r run build` (each package runs `tsc -p tsconfig.json`; `apps/desktop` additionally runs `vite build` three times for renderer/main/preload) |
| Dev | `pnpm dev:desktop` (Electron+Vite dev server), `pnpm dev:cli` |
| Test | `pnpm test` → `vitest run` (single root `vitest.config.ts`, not per-package) |
| Lint | `pnpm lint` → `eslint . --ext .ts,.tsx` (root `eslint.config.js`, flat config, ignores `dist/build/node_modules/GeneratedGames`) |
| Typecheck | `pnpm typecheck` → `pnpm -r run typecheck` (each package: `tsc -p tsconfig.json --noEmit`) |
| CLI entry (once built) | `pnpm metroforge <command>` → `node apps/cli/dist/index.js` |

**Verified this session** (exact commands, exact results — see §26 for full detail):
`pnpm install` clean · `pnpm build` clean (13/13 packages + desktop triple-vite-build) ·
`pnpm typecheck` clean (0 errors) · `pnpm test` → **59/59 tests passed**, 17 test files · `pnpm lint`
→ **0 errors**.

---

## 2. Complete Repository Tree

```
.
├── .env.example
├── .gitignore
├── .prettierrc
├── README.md
├── eslint.config.js
├── package.json                      # root workspace scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vitest.config.ts                  # single root test config for all packages
├── config/
│   ├── models.catalog.json           # built-in model catalog seed
│   ├── models.default.json           # ModelMetadata seed for ProviderRegistry
│   └── providers.default.json        # priority/enabled/license metadata per provider
├── docs/
│   ├── ARCHITECTURE.md
│   ├── BUILD_STATUS.md               # project's own status claims — not fully accurate, see below
│   ├── CLAUDE_REPOSITORY_AUDIT.md    # prior session's audit (this doc supersedes it for "current state")
│   ├── DECISIONS.md
│   ├── IMPLEMENTATION_STATUS.md      # prior session's status matrix
│   ├── MODEL_ECOSYSTEM.md
│   └── METROFORGE_CURRENT_BUILD.md   # this file
├── prompts/director/.gitkeep         # empty — no prompt templates exist
├── workers/                          # optional Python workers, not Node
│   ├── diffusers_audio_worker.py
│   ├── diffusers_image_worker.py
│   └── requirements-diffusers.txt
├── templates/godot-metroidvania/     # the reusable Godot 4 runtime, copied verbatim per project
│   ├── project.godot
│   ├── icon.svg
│   ├── data/rooms/rooms.json         # empty placeholder, overwritten by generation
│   ├── scenes/
│   │   ├── boot/Main.tscn
│   │   ├── world/{World,AbilityGate,AbilityPickup,RoomTransition}.tscn
│   │   ├── player/Player.tscn
│   │   ├── enemies/Enemy.tscn
│   │   └── bosses/Boss.tscn
│   └── scripts/
│       ├── core/{GameManager,EventBus,SaveManager,AudioManager,ProgressionManager}.gd  # 5 autoloads
│       ├── player/PlayerController.gd
│       ├── AI/{EnemyController,BossController}.gd
│       ├── combat/{HealthComponent,HitboxComponent,HurtboxComponent}.gd
│       ├── world/{WorldManager,AbilityGate,AbilityPickup,RoomTransition,RoomTileMap}.gd
│       └── UI/{GameHUD,TitleScreen}.gd
├── apps/
│   ├── cli/src/
│   │   ├── index.ts                  # commander program, registers 6 command groups
│   │   └── commands/{create,doctor,generate,models,providers,validate}.ts
│   └── desktop/
│       ├── electron/{main,preload,handlers}.ts
│       ├── src/{App.tsx,main.tsx,styles.css}   # single-file React app, 7 screens
│       ├── index.html
│       └── vite.config.ts
└── packages/
    ├── shared/src/{config,constants,logger,index}.ts       # config loading, GENERATION_PHASES, PROFILE_DEFAULTS
    ├── schemas/src/{core,game,models,bibles,index}.ts       # every Zod schema (GameDNA, WorldGraph, ModelEntry, etc.)
    ├── core/src/{product,index}.ts                          # version string only
    ├── database/src/
    │   ├── database.ts, migrations.ts, types.ts
    │   ├── sqlite.ts, node-sqlite.ts, sqljs.ts, sql.js.d.ts # dual sqlite backend switch
    │   └── repositories/{project,job}.ts                    # only 2 of 6 tables have repositories
    ├── ai/src/
    │   ├── bootstrap.ts, registry.ts, types.ts, provider-plugin.ts, generation-router.ts
    │   ├── model-catalog.ts, model-scout.ts, model-download-manager.ts, model-benchmark.ts
    │   ├── hardware-profiler.ts
    │   ├── generators/game-dna.ts
    │   └── providers/{ollama,gemini,groq,openrouter,huggingface,base-http}.ts
    ├── procedural/src/
    │   ├── world.ts, content.ts, bibles.ts, audio.ts, music.ts, stable-audio.ts, rng.ts
    │   └── *.test.ts (7 test files)
    ├── assets/src/
    │   ├── asset-pipeline.ts, pixel-art-processor.ts, vlm-critic.ts, png.ts
    │   ├── providers/{comfyui,diffusers}.ts
    │   └── types/{image-gen,vision,prompts}.ts
    ├── godot/src/assembler.ts                                # the entire Godot project generator, one 519-line file
    ├── qa/src/validator.ts                                   # QAValidator + RepairEngineer, one 426-line file
    ├── generation/src/pipeline.ts                             # the entire orchestrator, one 404-line file
    └── tools/src/registry.ts                                 # ToolRegistry (Godot/Ollama/Python/FFmpeg/Git detection)
```

Excluded per instructions: `node_modules/`, `.git/`, `dist/`, `dist-electron/`, `GeneratedGames/`
(3 sample projects present locally, gitignored), `.metroforge/` (local sqlite db), `*.tsbuildinfo`.

**Notable absences** (not omitted from the tree above — they genuinely don't exist):
no `docker/`, no CI config (no `.github/workflows`), no `src/` at repo root, no `migrations/`
directory (migrations are inline SQL strings in `migrations.ts`), no `scripts/` directory beyond
the two Python workers, no test fixtures directory, no `LICENSE` file.

---

## 3. Architecture

**What actually exists**, by layer:

- **Frontend**: React 18 function components, all in one file (`apps/desktop/src/App.tsx`, 464
  lines, 7 screen components). No router library — a `useState` string toggles which screen
  renders. No global state library (no Redux/Zustand/Context) — each screen manages its own
  `useState`/`useEffect` and calls `window.metroforge.*`.
- **Desktop runtime**: Electron 33, `contextIsolation: true`, `nodeIntegration: false` (correct
  security posture). `apps/desktop/electron/main.ts` creates one `BrowserWindow`. No auto-updater,
  no menu customization, no multi-window support.
- **IPC boundary**: `apps/desktop/electron/preload.ts` exposes exactly 10 methods via
  `contextBridge.exposeInMainWorld('metroforge', {...})`. `apps/desktop/electron/handlers.ts`
  registers matching `ipcMain.handle(...)` for all 10. This is the **entire** communication
  surface between renderer and Node — no additional IPC channels exist anywhere else.
- **CLI**: Commander.js program (`apps/cli/src/index.ts`), 7 registered subcommand groups
  (`doctor`, `create`, `generate`, `providers`, `validate`, `models` [+`rank`,`starter-pack`,
  `download`], `scout`). Both CLI and desktop call the **same** `@metroforge/generation`
  `GenerationPipeline` class — there is no separate "backend service"; the CLI process and the
  Electron main process both directly instantiate and run the pipeline in-process. There is no
  HTTP server, no REST API, no tRPC — communication is direct function calls within one Node
  process (Electron main) or one CLI invocation.
- **Shared packages**: 13 workspace packages under `packages/`, consumed via pnpm workspace
  protocol (`workspace:*`). Dependency graph verified via each package's `package.json`
  `dependencies` (see §31 for the graph and a real circular-risk check performed this session).
- **Database**: SQLite via two swappable backends — Node's built-in `node:sqlite` (used outside
  Electron, i.e. CLI) or `sql.js` (pure WASM, used inside Electron since `node:sqlite` native
  binding isn't reliably loadable there) — switched automatically at runtime by
  `packages/database/src/sqlite.ts:openSqliteDatabase()` based on
  `process.versions.electron != null`. One `.metroforge/metroforge.db` file per working directory.
- **Generation engine**: `packages/generation/src/pipeline.ts`'s `GenerationPipeline.run()` is a
  single ~300-line async method that runs every phase **sequentially, in-process, synchronously
  awaited** — there is no job queue, no worker pool, no background process. "Jobs" are database
  rows created for bookkeeping/progress-reporting, not actual queued work items (see §21).
- **AI orchestration**: Two **parallel, non-integrated** capability-routing systems exist
  simultaneously — see §8 and §31 for the concrete evidence this is real duplication, not just a
  naming overlap.
- **Provider system**: `ProviderRegistry`/`CapabilityRouter`/`FallbackManager` in
  `packages/ai/src/registry.ts` — real, used, and is the one actually driving Game DNA generation.
- **Model system**: `ModelCatalogService` (JSON-file-backed, `config/models.catalog.json` seed +
  `.metroforge/models.catalog.json` user overlay), `ModelScout` (Ollama-only live discovery),
  `ModelDownloadManager` (approval-gated, 3 real download adapters), `ModelBenchmarkService` (real
  Ollama `/api/generate` probe with heuristic fallback).
- **Asset pipeline**: `packages/assets/src/asset-pipeline.ts` — procedural sprite/tileset
  generation with optional AI image-gen (ComfyUI/Diffusers) overlay, VLM critique via Ollama
  vision models, deterministic pixel-art post-processing. Disk-checkpointed (added this session,
  see the two docs referenced above for verification detail).
- **Procedural generation**: `packages/procedural/` — world topology (seeded RNG), game content
  (enemies/bosses/quests/items), design bibles (art/audio), music (real WAV synthesis + MIDI +
  Furnace tracker export), SFX (real WAV synthesis).
- **Godot integration**: `packages/godot/src/assembler.ts` — one class,
  `GodotProjectAssembler.assemble()`, that copies the template directory verbatim
  (`cpSync(TEMPLATE_PATH, outputDir, {recursive:true})`) then procedurally writes/overwrites
  scenes, scripts, and data JSON on top of it.
- **QA/validation**: `packages/qa/src/validator.ts` — `QAValidator` (9 static gates + 1 optional
  Godot-headless gate) and `RepairEngineer` (4 deterministic repair cases).
- **Job system**: Real DB persistence of job/stage rows, but **not** a real job queue — see §21.
- **Filesystem/storage**: `GeneratedGames/<slug>/` per project (path resolved by
  `resolveGeneratedGamesPath` in `packages/shared/src/config.ts`), `.metroforge/` for db + model
  catalog overlay, `models/` for downloaded model weights (gitignored, empty in this repo).
- **Configuration**: `.env` (dotenv-style, loaded via `loadConfig()` in
  `packages/shared/src/config.ts`) + 3 JSON files under `config/`.
- **Logging**: `packages/shared/src/logger.ts` — a minimal structured console logger (see §25
  for exact capability).
- **Security**: contextIsolation on, no eval of generated code, `slugify()` strips project names
  to `[a-z0-9-]` before using them in filesystem paths. See §28 for gaps found.

**How modules actually communicate** (traced, not assumed):

```
CLI: apps/cli/src/commands/create.ts
  → new GenerationPipeline() (@metroforge/generation)
  → pipeline.run({...})  — direct in-process call, fully synchronous await chain

Desktop: apps/desktop/src/App.tsx (CreateScreen)
  → window.metroforge.generateGame(opts)          [preload.ts bridge]
  → ipcRenderer.invoke('generate-game', opts)
  → apps/desktop/electron/handlers.ts ipcMain.handle('generate-game', ...)
  → new GenerationPipeline() → pipeline.run({...}, onPhase callback)
  → onPhase sends 'generation-progress' events back over the same IPC channel
  → App.tsx's onGenerationProgress listener updates React state live

Inside GenerationPipeline.run() (packages/generation/src/pipeline.ts):
  → bootstrapProviders() (@metroforge/ai)          — builds ProviderRegistry + CapabilityRouter + FallbackManager + GenerationRouter
  → generationRouter.generate({ capability: 'JSON_GENERATION', task: 'game_dna', ... })   — the single canonical router (fixed in a later session — was dead code, see §8)
  → generateWorldTopology / generateGameContent / generateDesignBible / synthesizeAllSfx / generateMusicFromAudioBible  (@metroforge/procedural, all synchronous/deterministic, no AI)
  → new AssetPipeline().generate(...)              (@metroforge/assets — optional ComfyUI/Diffusers overlay, else procedural)
  → new GodotProjectAssembler().assemble(...)       (@metroforge/godot — writes the actual project)
  → new QAValidator().validateProject(...)          (@metroforge/qa — 9 static gates)
  → optionally QAValidator().validateGodotHeadless() if Godot is detected
  → new RepairEngineer().repair(...) if QA failed
```

---

## 4. Application Entry Points

| Purpose | Exact path |
|---|---|
| Desktop startup / Electron main | `apps/desktop/electron/main.ts` |
| Electron preload (IPC bridge) | `apps/desktop/electron/preload.ts` |
| Electron IPC handler registration | `apps/desktop/electron/handlers.ts` |
| React application root | `apps/desktop/src/main.tsx` → renders `App` from `apps/desktop/src/App.tsx` |
| CLI entry | `apps/cli/src/index.ts` (shebang `#!/usr/bin/env node`, built to `apps/cli/dist/index.js`) |
| Generation pipeline orchestrator | `packages/generation/src/pipeline.ts` — class `GenerationPipeline`, method `run()` |
| Godot project generator | `packages/godot/src/assembler.ts` — class `GodotProjectAssembler`, method `assemble()` |
| Database initialization | `packages/database/src/database.ts` — `MetroForgeDatabase.open()` / `createDatabase()`, runs `runMigrations()` from `migrations.ts` on every open |
| Worker processes | `workers/diffusers_image_worker.py`, `workers/diffusers_audio_worker.py` — spawned via `node:child_process` `spawn()` from `packages/assets/src/providers/diffusers.ts` and `packages/procedural/src/stable-audio.ts` respectively; **not started automatically**, only invoked on-demand when those providers' `checkHealth()`/`generateImage()`/etc. run |
| AI provider bootstrap | `packages/ai/src/bootstrap.ts` — `bootstrapProviders()`, called independently by `pipeline.ts`, `apps/cli/src/commands/providers.ts`, and `apps/desktop/electron/handlers.ts` (three separate call sites, each re-registers all providers fresh — no shared singleton) |

---

## 5. Implementation Status Matrix

Legend: **COMPLETE** (does what it claims, for its stated scope) · **PARTIAL** (real but
incomplete) · **STUB** (exists, self-limited/heuristic, not the real mechanism) · **MOCK**
(fabricated output) · **BROKEN** · **MISSING** · **NEEDS_VALIDATION** (plausible, not exercised
here).

| Subsystem | Status | Why |
|---|---|---|
| Desktop application | COMPLETE | 7 screens, all wired to real IPC handlers, no mock data anywhere (verified by reading every screen component and every handler — see §23) |
| CLI | COMPLETE | 9 real subcommands, all verified to actually run against real code paths this session |
| Project management | PARTIAL | `ProjectRepository` (create/find/list/updateStatus) is real and used. No update/delete/rename beyond status. No project settings persistence beyond the 8 columns in the `projects` table |
| Database | PARTIAL | Schema defines 6 tables (`projects`, `generation_jobs`, `generation_stages`, `artifacts`, `validation_results`, `settings`). Only `projects` and `generation_jobs`/`generation_stages` have repository classes and are ever written to (verified: `grep -rn "INTO artifacts\|INTO validation_results\|INTO settings"` returns **zero** matches anywhere in source). `artifacts`, `validation_results`, `settings` tables are dead schema — never populated. Real data for those concepts is persisted as flat JSON files instead (`generation_manifest.json`, `validation_report.json`) |
| Settings | STUB | No settings table usage (see above). Desktop `SettingsScreen` is read-only, shows 2 config values, says "Edit .env in the project root" — there is no in-app settings mutation anywhere |
| Tool Registry | COMPLETE | `packages/tools/src/registry.ts` — real `execSync`-based detection of Godot/Ollama/Python/FFmpeg/Git, verified live this session (correctly reports Godot/Ollama/FFmpeg/Git as WARN "not detected" and Node/pnpm as PASS in this environment) |
| Hardware Profiler | PARTIAL | Real RAM/CPU detection cross-platform. GPU/VRAM detection is **Windows-only** (`wmic`) — silently returns `undefined` on macOS/Linux, no CUDA/ROCm/Metal probing beyond a single `nvidia-smi --version` existence check on Windows |
| Model Registry | COMPLETE (small) | `packages/ai/src/registry.ts` `ModelRegistry` — in-memory only, loaded once from `config/models.default.json` at bootstrap, never persisted or updated at runtime |
| Model Catalog | COMPLETE | `packages/ai/src/model-catalog.ts` — real JSON-backed catalog, user-overlay + builtin fallback, real filter/rank logic with hardware-aware scoring |
| Model Download Manager | COMPLETE | 3 real adapters (Ollama `pull`, HuggingFace CLI, Diffusers/HF snapshot download), approval-gated (`throw` if `!request.approved`), real subprocess spawning |
| Model Scout | COMPLETE (Ollama only) | Real `/api/tags` probe against a running Ollama server; `huggingface`/`builtin` listed in `ScoutOptions.sources` type but **not implemented** — `refresh()` only branches on `'ollama'` and `'local'` |
| Capability Router | COMPLETE (for text) | `packages/ai/src/registry.ts` `CapabilityRouter` — real priority/mode/capability filtering, used live by the pipeline for Game DNA generation |
| Generation Router | **FIXED (later session)** — COMPLETE for text | `packages/ai/src/generation-router.ts` was dead code (instantiated, never called — confirmed by grep at the time). Rewritten as a thin facade over the already-proven `CapabilityRouter`/`FallbackManager` (dependency-injected via `createGenerationRouter(router, fallback)`, not reconstructed) rather than its previous parallel `ModelCatalogService`-based ranking, which had a real underlying bug: catalog entries for hosted providers default `enabled: false` with nothing flipping that on live API key presence, so it could never actually route to a hosted provider regardless of configuration. `pipeline.ts`'s Game DNA call now genuinely goes through `generationRouter.generate(...)`. Live-verified both the normal deterministic-fallback path and a real-HTTP-401-from-a-configured-but-invalid-key path. See `docs/IMPLEMENTATION_STATUS.md` for full detail |
| Fallback Manager | COMPLETE | `withFallback()` in `registry.ts` works (tries up to N candidate providers, catches errors, retries next) — used live by the pipeline for Game DNA, now reached via `GenerationRouter.generate()` rather than called directly. `GenerationRouter` no longer has separate fallback logic of its own — it delegates to this one, not a second implementation |
| Provider Health Monitor | PARTIAL | Each provider has `checkHealth()` called once at `initialize()` time during bootstrap. No periodic re-check, no health-based auto-disable during a long-running job |
| Ollama | WORKING | `packages/ai/src/providers/ollama.ts` — real `/api/generate` calls, real health check, used for Game DNA text generation, VLM critique (vision models), and model benchmarking. **Not reachable in this environment** (no Ollama server running) — falls back to deterministic Game DNA generation, verified live this session |
| llama.cpp | MISSING | No adapter exists anywhere in source |
| Gemini | WORKING (untested live) | `packages/ai/src/providers/gemini.ts` extends `BaseHttpTextProvider` — real HTTP implementation, gated on `GEMINI_API_KEY` env var (unset in this environment, so `enabled: false`) |
| Groq | WORKING (untested live) | Same pattern as Gemini, gated on `GROQ_API_KEY` |
| OpenRouter | WORKING (untested live) | Same pattern, gated on `OPENROUTER_API_KEY` |
| Hugging Face | WORKING (untested live) | Same pattern, gated on `HUGGINGFACE_API_KEY` — text-generation only (not the image side) |
| ComfyUI | WORKING (untested live) | `packages/assets/src/providers/comfyui.ts` — real HTTP workflow-submission adapter with polling. No local ComfyUI server running in this environment, so `checkHealth()` fails and the pipeline falls back to procedural sprites (verified: every live generation this session used `provider: 'procedural'` for image assets) |
| Diffusers | WORKING (untested live) | `packages/assets/src/providers/diffusers.ts` — spawns `workers/diffusers_image_worker.py` as a subprocess. Python not confirmed installed with the right deps in this environment; not exercised live |
| Game DNA | COMPLETE | `packages/ai/src/generators/game-dna.ts` — AI-first with a real deterministic fallback path (`source: 'ai' | 'deterministic'`). Verified live this session: with no LLM reachable, `create` still produces a valid, schema-passing `game_dna.json` via the deterministic path |
| Design Bible | COMPLETE (procedural only) | `packages/procedural/src/bibles.ts` `generateDesignBible()` — fully deterministic (palette/theme/audio direction from seed), no AI path exists for this at all despite the name "bible" implying narrative generation |
| Narrative Bible | MISSING | `GENERATION_PHASES` declares a `narrative_bible` phase; no generator function, no schema section, no pipeline step produces one. `GameDNA.narrative` (premise/protagonist/antagonist/centralConflict) is the closest equivalent and is generated as part of Game DNA itself, not a separate bible |
| Art Bible | COMPLETE (procedural only) | Part of `generateDesignBible()`'s `.art` field — palette, negative prompts, character/environment guidelines. Consumed by `AssetPipeline` for prompts. Deterministic only |
| Audio Bible | COMPLETE (procedural only) | Part of `generateDesignBible()`'s `.audio` field — biome themes, instrumentation. Consumed by `generateMusicFromAudioBible()`. Deterministic only |
| Agent system | MISSING | No autonomous agent loop, no multi-step AI planning beyond single-shot capability calls |
| Project memory | MISSING | No retrieval, no persisted "what was decided before" beyond the flat JSON files already on disk |
| Embeddings | MISSING | `EmbeddingProvider` interface exists in `packages/ai/src/provider-plugin.ts` (never implemented, never instantiated anywhere) |
| Reranking | MISSING | No interface, no implementation |
| Generation jobs | PARTIAL | Real DB rows, real sequential phase execution, real progress callback — not a real queue (see §21) |
| Checkpointing | PARTIAL | Game DNA, sprite, and tileset generation checkpoint to disk and are skipped on `--resume` (added this session — see `docs/CLAUDE_REPOSITORY_AUDIT.md` items 4–5, 7 for the exact verification). World/content/audio/assembly always recompute (cheap, deterministic, so low priority by design) |
| Resume/retry | PARTIAL | `--resume` flag exists on `create`/`generate` CLI commands. No retry-with-backoff for failed AI calls beyond `FallbackManager`'s up-to-3-provider attempt loop. No mid-phase resume (only whole-phase skip via checkpoint) |
| Procedural RNG | COMPLETE | `packages/procedural/src/rng.ts` `SeededRNG` — deterministic, verified via test asserting two instances with the same seed produce identical sequences |
| World generator | COMPLETE (fixed a real gameplay bug this session) | `packages/procedural/src/world.ts` `generateWorldTopology()`. **A serious bug was found and fixed this session**: every ability-gated edge shared its room pair with an already-existing free, unconditional spine edge, making every ability gate in every generated game silently bypassable — confirmed on a real generated graph, fixed, and verified at 233-room scale. See `docs/CLAUDE_REPOSITORY_AUDIT.md` item 12 for full evidence |
| Progression graph | COMPLETE (fixed a real bug this session) | Same file. A second bug was found and fixed: the abstract progression chain's ability-gating condition could never evaluate true, so the `progression_graph` QA gate was a no-op that could never fail, in any run, ever, before this session |
| Lock/key solver | PARTIAL | `requiredAbilities`/`keyId` fields exist in the `Room`/`RoomEntrance` schemas but are not populated by any generator — only ability gates (not key/lock pairs) are actually generated |
| Soft-lock detector | COMPLETE (renamed/consolidated this session) | `validateReachability()` (abstract chain) + `validateWorldReachability()` (real room graph, progressive ability unlock) + `validateWorldConnectivity()` (pure topology). A previously-existing `detectSoftLocks()` function was a dead one-line duplicate of `validateReachability()` with zero callers anywhere — removed this session |
| Circular dependency detection | MISSING | No cycle detection in the progression/world graph algorithms |
| Completion validation | PARTIAL | `validateWorldReachability()` proves the final-boss room is reachable given progressive ability pickup. No check that the game is completable end-to-end at the Godot-runtime level (no automated playtest, see below) |
| Room generator | PARTIAL | Rooms are generated as flat platforms with a floor/wall layout (`buildRoomScene()` in `assembler.ts`) — width/height/archetype vary by seed, but there is no room-shape variety (no vertical rooms, no puzzle geometry, no multi-floor layouts) |
| Biome generator | PARTIAL | Palette + archetype assignment per biome via `BIOME_PALETTES` (5 hardcoded palettes, cycled by index) in `packages/assets/src/asset-pipeline.ts`. No biome-specific hazard/enemy-family logic beyond enemy `biomeId` tagging |
| Player mechanics generation | PARTIAL | `GameDNA.movement` (walkSpeed/runSpeed/jumpHeight/gravity) is generated and **is actually consumed** by `PlayerController.gd`'s `@export` defaults being written by the assembler (verified: assembler.ts writes movement values into the Player scene). Coyote time/jump buffer/dash are template constants, not DNA-driven |
| Combat generation | PARTIAL | `GameDNA.combat.style/meleeEnabled/rangedEnabled` generated; template's `PlayerController.gd` only ever implements melee (a single `_perform_attack()` hitbox) regardless of `rangedEnabled` — ranged combat is declared in data but never implemented in the runtime |
| Ability generation | COMPLETE (structurally), PARTIAL (gameplay variety) | Abilities are generated (id/name/category), gated into the world graph correctly (post-fix). Runtime-side, only `dash` has an actual implemented mechanic in `PlayerController.gd` — other ability categories (combat/utility/passive) have no corresponding GDScript behavior; they exist as unlock-gates only |
| Enemy generation | COMPLETE (data), PARTIAL (behavior variety) | `generateGameContent()` produces real enemy stat blocks (health/damage/speed/movement/perception/combat). `EnemyController.gd` implements exactly one behavior: horizontal patrol + contact damage — `movement` values like `'fly'`, `'hover'`, `'charge'`, `'teleport'`, `'burrow'` are valid per the `EnemySchema` enum but have **no corresponding GDScript logic** anywhere in the template |
| Boss generation | COMPLETE (data), PARTIAL (behavior variety) | Real phase data (health thresholds, attack lists). `BossController.gd` implements one generic attack pattern with phase-count-driven cooldown scaling — the specific `attacks` string list (e.g. `'slam'`, `'projectile'`, `'area_burst'`) is generated but never dispatched to distinct GDScript behaviors; `_perform_attack()` is a single hardcoded hitbox activation regardless of which attack was "chosen" |
| NPC generation | MISSING | `NPCSchema` exists in `packages/schemas/src/game.ts`. `generateGameContent()` **never produces any NPCs** — confirmed by grep, zero NPC-generation logic in `content.ts`. No `.tscn`/`.gd` file for an NPC exists in the template either |
| Quest generation | PARTIAL (data-only, not gameplay-connected) | `generateGameContent()` produces real quest data with objectives/prerequisites/rewards, written to `data/quests/quests.json` by the assembler. **No runtime script ever reads this file** — confirmed by grep across every `.gd` file in the template. Quests exist as inert JSON with no in-game effect |
| Item generation | PARTIAL (same pattern as quests) | 2 hardcoded items (`scrap` currency, `health_vial`) always generated regardless of `GameDNA`/seed — not actually procedural despite the function name. Written to `data/items/items.json`. No inventory system in the runtime reads or uses it |
| Economy generation | MISSING | No shop, no currency-spending logic, no economy balancing anywhere. `scrap` currency is generated as an item and awarded by quest rewards data, but nothing in the runtime lets the player spend it |
| Image generation | PARTIAL | Real ComfyUI/Diffusers adapters exist; always falls back to procedural pixel-art generation (`packages/assets/src/png.ts`) when neither is reachable, which is the path exercised in every live test this session |
| Sprite generation | COMPLETE (procedural), WORKING-untested (AI) | Procedural sprite generation (`generateProceduralSprite`) is real and verified live. AI path exists but untested live in this environment |
| Sprite-sheet processing | COMPLETE | `packages/assets/src/pixel-art-processor.ts` — real deterministic resize/palette-quantize/alpha-cleanup/grid-align pipeline, 222 lines, verified idempotent this session (see checkpointing work in `CLAUDE_REPOSITORY_AUDIT.md`) |
| Animation generation | PARTIAL (extended, player only) | Walk (`generateWalkCycleSheet`) plus, added in a later session, real **attack** (`generateAttackSheet` — progressive forward lean + impact-frame brightness pulse) and **hurt** (`generateHurtFlashSheet` — alternating red damage-flash tint) sheets for the player — genuinely distinct procedural transformations, not relabeled copies of the walk bob. `AnimatedAssetSprite.gd` extended to build multiple named `SpriteFrames` animations from multiple sheet paths (`attack_sheet_path`/`hurt_sheet_path`, optional — empty means "not generated," handled gracefully, not an error), confirmed this is a genuinely working runtime mechanism (not the broken gap this row previously described — see `docs/IMPLEMENTATION_STATUS.md` for why building a generation-time `.tres` compiler to replace it was deliberately not done). `PlayerController.gd` now actually plays "attack" on swing and "hurt" on taking damage, with the per-frame walk/idle animation logic correctly not interrupting them mid-play. Live-verified via the runtime smoke test: 2 new checks (`player_has_attack_animation`, `player_has_hurt_animation`), both passing, real Godot execution. **Enemies and bosses still only have walk/idle** — same template script supports them (`attack_sheet_path`/`hurt_sheet_path` are generic, not player-specific), just not wired for those asset families yet — a natural, bounded next increment, not a redesign |
| Tileset generation | COMPLETE | Real procedural tileset source generation + per-tile slicing (`sliceTiles()`), checkpointed to disk this session, verified to produce a working Godot `TileSetAtlasSource` at runtime (per `RoomTileMap.gd` logic inspection — not runtime-tested, no Godot binary available) |
| Background generation | PARTIAL | Room backgrounds are either the tileset texture (`TextureRect`) or a flat procedurally-tinted `ColorRect` — no distinct "background art" generation separate from tilesets |
| UI asset generation | MISSING | `GENERATION_PHASES` declares a `ui_assets` phase; no generator, no pipeline step. The Godot HUD (`GameHUD.gd`/`Main.tscn`) uses Godot's built-in `ProgressBar`/`Label`/`Button` nodes, no generated UI art |
| VFX generation | MISSING | `GENERATION_PHASES` declares a `vfx` phase; `AbilitySchema.vfxId` field exists; nothing generates a VFX asset or references one anywhere in the template |
| Music generation | COMPLETE | `packages/procedural/src/music.ts` — real WAV synthesis per biome, real MIDI export (`exportPatternToMidi`), real Furnace tracker JSON export (`exportFurnaceModule`). Verified live: 10 real audio files with zero AI tools involved |
| SFX generation | COMPLETE | **FIXED (later session):** `AudioManager.gd`'s three methods are now real — a pooled `AudioStreamPlayer` array for SFX (no per-call allocation), a dedicated music player with same-track no-op + WAV loop-mode handling, missing files warn once rather than crash. Wired to real gameplay events: player jump/dash (`PlayerController.gd`), hit/death for player+enemy+boss uniformly via one new `HealthComponent.gd` hook (`hit_sfx_id`/`death_sfx_id` exports — Boss.tscn overrides to the punchier `boss_hit`), ability pickup, title-screen buttons. `WorldManager.gd`'s own direct `AudioStreamPlayer` was removed in favor of calling `AudioManager.play_music()`. **Live-verified via real Godot execution, not just code reading**: the runtime smoke test now asserts music is actually playing after room entry, `play_sfx()` actually starts a pooled player, and an intentionally-missing SFX id produces the expected warning without crashing — all 3 checks pass against the real Godot 4.7.1 binary. Original finding, now resolved: ~~`packages/procedural/src/audio.ts` `synthesizeAllSfx()` produces real synthesized WAV files (jump/dash/hit/etc.), verified live. But `AudioManager.gd`'s `play_sfx()`, `play_music()`, and `stop_music()` were all empty `pass` function bodies, and no script called them — generated SFX files were written to disk but never played.~~ |
| Speech generation | MISSING | No TTS provider, no adapter, no reference anywhere in source beyond the master-spec's own aspirational list |
| Vision QA | PARTIAL | `packages/assets/src/vlm-critic.ts` — real Ollama vision-model critique with a deterministic fallback (`runDeterministicAssetChecks`) when unavailable. Only used for single-asset critique, not cross-view character consistency |
| Background removal | MISSING | Interface stub only (`BackgroundRemovalProvider` in `provider-plugin.ts`), zero implementations |
| Segmentation | MISSING | Same pattern, `SegmentationProvider` |
| Upscaling | MISSING | No interface, no implementation, no reference |
| Depth estimation | MISSING | No interface, no implementation |
| Asset Registry | COMPLETE (fixed this session per prior audit) | `generation_manifest.json`, written by the assembler, records every texture/audio artifact with id/path/provider/fallback/critique score |
| Generation Manifest | COMPLETE | Same as above — real, verified live producing real entries in multiple sessions |
| Dependency Graph | PARTIAL | New this session: `asset_references_valid` QA gate proves every `ext_resource` scene reference resolves to a real file. No equivalent check for dynamically-constructed runtime paths (audio/tileset loaded by ID string at runtime) |
| Godot runtime template | PARTIAL | Substantial (player movement w/ coyote time & jump buffer, combat via hitbox/hurtbox components, enemy/boss AI, room transitions, ability gates, save/load, minimal HUD) but missing inventory, dialogue, NPCs, quest UI, pause menu, settings menu, map system, VFX — see §13 |
| Godot Project Assembler | COMPLETE (for its current scope) | `packages/godot/src/assembler.ts` — real template copy + procedural scene/script/data generation, verified against 2 pre-existing fixture projects and multiple fresh live runs this session, all passing 9/9 QA gates |
| Godot scene generation | COMPLETE | Real `.tscn` text generation for rooms, with `ext_resource`/`sub_resource`/node trees |
| GDScript generation | PARTIAL | The assembler does **not** generate GDScript — it writes data files (`rooms.json`, `enemies.json`, etc.) that the **static, template-provided** GDScript reads at runtime. No per-project custom GDScript is ever generated |
| Godot Resource generation | PARTIAL | TileSet construction happens at Godot **runtime** (`RoomTileMap.gd:_build_tilemap()` builds a `TileSetAtlasSource` in `_ready()`), not at generation time as a `.tres` file |
| Godot TileSet generation | PARTIAL (see above — deferred to runtime, not pre-generated as a resource file) |
| Godot SpriteFrames generation | MISSING | No `SpriteFrames` resource (`.tres`) is generated; `AnimatedSprite2D` nodes in template scenes reference sprite sheets that would need SpriteFrames wiring — not found anywhere in `assembler.ts` |
| Input configuration | COMPLETE | Full `[input]` InputMap baked into the template's `project.godot`, verified present, and repairable (`RepairEngineer.repair()` restores it from the template if the `[input]` section is corrupted — verified live this session with a real corruption-then-repair test) |
| Save system | COMPLETE (basic) | Real JSON save/load to `user://savegame.json` (`SaveManager.gd`), covers abilities + room id + playtime scaffold. Quest/collectible progress fields exist in the save dict but nothing writes to them (quests aren't runtime-tracked at all, per above) |
| Map system | MISSING | No map/minimap scene, script, or UI element anywhere |
| Inventory | MISSING | No inventory scene/script; items exist only as generation-time JSON data |
| Dialogue | MISSING | No dialogue system, no dialogue UI, `dialogueIds`/`dialogueStartId` schema fields are unused |
| UI runtime | PARTIAL | `GameHUD.gd` (health bar + ability list + victory overlay) and `TitleScreen.gd` (start button → load `World.tscn`) exist. No pause menu, no settings menu, no death/game-over screen beyond the respawn logic in `PlayerController.gd` |
| Audio runtime | COMPLETE | **FIXED (later session)** — see "SFX generation" row above. `AudioManager` is now authoritative for both music and SFX |
| Enemy runtime | PARTIAL | One behavior (patrol + contact damage) regardless of generated `movement`/`combat.type` variety |
| Boss runtime | PARTIAL | One generic attack pattern regardless of generated `attacks` list content |
| Godot headless validation | COMPLETE (code), NEEDS_VALIDATION (never run against real Godot) | `QAValidator.validateGodotHeadless()` in `packages/qa/src/validator.ts` — real `execSync` invocation with output parsing for `"Parse Error"`/`"Failed to load"`/`"ERROR:"`. **No Godot binary available in this environment to actually exercise this path** — every live test this session reported `[!] godot_imports: Skipped — Godot not detected` |
| Automated repair | PARTIAL | 4 real deterministic cases (manifest recreation, InputMap restoration, template-static-file restoration, project.godot/Main.tscn title-patch restoration) — all live-verified this session including a full corrupt→repair→revalidate cycle. No AI-assisted repair tier exists at all (spec's own two-tier design: deterministic-then-AI is only half-built) |
| Automated playtesting | PARTIAL | `validateWorldReachability()` is a genuine graph-level proof of completability (not a mock) but it is **not** a simulated agent stepping through the actual Godot runtime — no computer-vision or actual game-loop simulation exists |
| Export | STUB | No distinct "export" step exists — the generated project **is** the `GeneratedGames/<slug>/` directory already; there is no packaging/zipping/`export_manifest.json` generation (spec §59's export manifest concept is entirely unimplemented — confirmed by grep, no `export_manifest` string anywhere in source) |
| Licensing/provenance | PARTIAL | `license`/`commercialUse` fields exist on `ModelEntry` and are surfaced in the CLI (`models list`) and download-plan warnings. **Nothing enforces or blocks** based on license during actual generation or export — a "commercial-safe" mode does not exist |
| Security/path validation | PARTIAL | `slugify()` strips project slugs to `[a-z0-9-]` before filesystem use (real, effective). No archive extraction anywhere (so no zip-slip surface). See §28 for the concrete gaps found |
| Logging | PARTIAL | `packages/shared/src/logger.ts` — structured-ish console logger (`createLogger(name)` returns `.info/.warn/.error/.debug` with a namespace prefix and optional metadata object). No log file output, no log level filtering beyond a `METROFORGE_LOG_LEVEL` env var that's read but its effect wasn't traced to actual behavior in this pass |
| Tests | PARTIAL | 59 tests across 17 files, all passing (verified this session). Coverage is real but thin relative to the codebase's size — no tests for the desktop app, CLI commands, database repositories, or the AI provider HTTP adapters (those would need network mocking that doesn't exist) |

---

## 6. AI Models

**Configured and referenced** — the actual catalog file is `config/models.catalog.json`; I did not
exhaustively re-list every entry here (it's a data file, inspect directly), but the routing
metadata that matters architecturally is in `config/models.default.json`
(`packages/ai/src/types.ts` `ModelMetadata` shape) and is loaded into the in-memory
`ModelRegistry` at bootstrap:

| Model ID (from `config/models.default.json`) | Provider | Local/Cloud | Callable in this env | Tested live this session |
|---|---|---|---|---|
| (loaded via `ModelRegistry.load()` from `config/models.default.json`) | varies | varies | Ollama models: no (server unreachable) | No — Game DNA fell back to the deterministic path in every live run |

The **catalog** (`ModelCatalogService`, backed by `config/models.catalog.json` +
`.metroforge/models.catalog.json` overlay) is a richer data source, but — after `GenerationRouter`
was fixed in a later session to delegate to `CapabilityRouter`/`ProviderRegistry` instead of
ranking from catalog data (see §8) — it is **not** part of the actual routing path at all anymore.
It's used by the CLI's `models list/rank` commands and `ModelScout` (both live and real), and by
`rankModelsForCapability()`, which nothing in the generation pipeline currently calls. Starter-pack
model IDs referenced in
`packages/ai/src/hardware-profiler.ts:getStarterPack()`:

- `llama3.2:3b`, `qwen2.5-coder:7b`, `nomic-embed-text` (LOW_RESOURCE)
- `qwen3:8b`, `qwen2.5-vl:7b`, `sd-1.5`, `bge-small-en` (BALANCED)
- `qwen3-coder-next`, `deepseek-r1:8b`, `qwen2.5-vl:7b`, `flux.1-schnell`, `stable-audio-open`, `bge-small-en` (HIGH_QUALITY)

These are **hardcoded string literals** in `getStarterPack()` — they are not cross-validated
against the actual catalog contents at compile time or runtime; if the catalog doesn't contain a
matching entry, the starter pack still lists it (untested whether this causes issues downstream).

### Planned/Documentation-Only Models

The master continuation-spec text (which produced this session's earlier work) references dozens
of model families (Qwen-Coder, DeepSeek, Mistral, FLUX, PixArt, AnimateDiff, Bark, etc.) as
architecturally-permissible — **none of these are hardcoded into application logic** beyond the
starter-pack list above and whatever is in `config/models.catalog.json` (a data file, not code).
The architecture is genuinely model-agnostic in the sense that adding a new model is a catalog
JSON edit, not a code change — but that's also because very little code path actually consumes
the catalog for real routing decisions (see §8).

---

## 7. AI Providers

| Provider | File | Auth | Model discovery | Health check | Generation | Streaming | Structured output | Retry | Rate-limit handling | Fallback integration | Test coverage | Classification |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Ollama | `packages/ai/src/providers/ollama.ts` | none (local) | `listModels()` via `/api/tags` | real `fetch` health probe | real `/api/generate` | No | `jsonMode` param passed through, no schema validation of the response | No | No | Yes — real `ProviderRegistry`/`FallbackManager` member | None (no `ollama.test.ts`) | **WORKING** |
| Gemini | `packages/ai/src/providers/gemini.ts` | `GEMINI_API_KEY` via `BaseHttpTextProvider` | Not implemented — `listModels()` inherited stub-ish from base | real `fetch` | real HTTP call | No | Same as Ollama | Base class only (no explicit retry loop found) | No explicit 429 handling | Yes | None | **WORKING** (untested live — no key configured) |
| Groq | `packages/ai/src/providers/groq.ts` | `GROQ_API_KEY` | Same pattern | Same | Same | No | Same | Same | No | Yes | None | **WORKING** (untested live) |
| OpenRouter | `packages/ai/src/providers/openrouter.ts` | `OPENROUTER_API_KEY` | Same pattern | Same | Same | No | Same | Same | No | Yes | None | **WORKING** (untested live) |
| Hugging Face | `packages/ai/src/providers/huggingface.ts` | `HUGGINGFACE_API_KEY` | Same pattern | Same | Same (text only) | No | Same | Same | No | Yes | None | **WORKING** (untested live) |
| NVIDIA NIM (added in a later session) | `packages/ai/src/providers/nvidia.ts` | `NVIDIA_API_KEY` | Real `GET /models` (confirmed live: public/unauthenticated, returns full catalog regardless of key validity) | Real, additive `getHealthDetails()` beyond the base interface (configured/reachable/latencyMs/errorCode) | Real `/chat/completions`, OpenAI-compatible | No | `response_format: json_object` when `jsonMode` | Yes — bounded exponential backoff + `Retry-After` on 408/429/5xx, fails fast on 400/401/403/404 | Yes — typed `NVIDIA_RATE_LIMITED`, retries then surfaces to `FallbackManager` | Yes, same `ProviderRegistry` mechanism as every other hosted provider | 18 tests, mocked `fetch` (`packages/ai/src/providers/nvidia.test.ts`) | **WORKING** — verified live against the real endpoint (base URL, auth shape, and the models-endpoint's auth-independence were all confirmed by direct `curl`/testing, not just documentation; see `docs/PROVIDERS.md`) |
| ComfyUI | `packages/assets/src/providers/comfyui.ts` | none (local) | N/A (workflow-based) | real `fetch` to a health endpoint | real workflow submission + polling | No | N/A (image) | Polling loop with timeout | No | Yes — `AssetPipeline` tries it, catches failure, falls back to procedural | None | **WORKING** (untested live — no server) |
| Diffusers | `packages/assets/src/providers/diffusers.ts` | none (local subprocess) | N/A | `checkHealth()` spawns the Python worker and checks response | real `spawn()` + stdin/stdout JSON protocol | No | N/A | No | N/A | Yes, same as ComfyUI | None | **WORKING** (untested live) |

All 5 hosted text providers share one base class, `packages/ai/src/providers/base-http.ts`
(`BaseHttpTextProvider`) — inspected as part of the priority-wiring fix in a prior session; it
implements `generateText()`, `checkHealth()`, constructor-level `enabled`/`priority` from config.
**No provider implements request streaming** (`TextGenerationResponse` is a single complete
string, not an async iterator) despite the master spec calling for streaming support.

---

## 8. Capability Routing

**FIXED in a later session — this section originally documented a real "two competing routers"
problem (see §31's history note) that has since been resolved.** `GenerationRouter` is now the
actual, single, canonical entry point for text generation, and the pipeline calls it.

**The actual, traced path a Game DNA generation request takes today:**

```
apps/cli/src/commands/create.ts (or apps/desktop electron handlers.ts)
  → new GenerationPipeline().run({ prompt, profile, mode, seed })
  → packages/generation/src/pipeline.ts, inside run():
      bootstrapProviders({ mode, ollamaBaseUrl, ...apiKeys })   [packages/ai/src/bootstrap.ts]
        → registers OllamaProvider always
        → registers Gemini/Groq/OpenRouter/HuggingFace/NVIDIA if mode allows AND api key present
        → returns { registry, models, catalog, router, fallback, generationRouter }
      generationRouter.generate({
        capability: 'JSON_GENERATION', task: 'game_dna', prompt, mode, jsonMode: true,
      })
        → packages/ai/src/generation-router.ts GenerationRouter.generate()
        → maps 'JSON_GENERATION' (the richer catalog-level ModelCapability) down to
          'json_generation' (the AICapability bucket CapabilityRouter understands) via
          CAPABILITY_TO_AI_CAPABILITY — a real, explicit table, not a guess
        → delegates entirely to the SAME proven router.getCandidates()/fallback.withFallback()
          this section previously described — ranking/retry logic was not reimplemented,
          only given one real public-facing entry point
      if ALL providers throw (e.g. none reachable):
        → pipeline.ts catches, falls back to generateGameDNA(..., router.route(context))
           which internally has its own deterministic (non-AI) fallback path
```

**Why the *old* `GenerationRouter` genuinely could not have worked as the real router**, confirmed
by re-reading its previous implementation before rewriting it: it ranked candidates from
`ModelCatalogService` data, where every hosted-provider catalog entry defaults `enabled: false`
with nothing anywhere flipping that flag based on live `NVIDIA_API_KEY`/`GEMINI_API_KEY`/etc.
presence — only `CapabilityRouter`, which reads the live, correctly key-gated `ProviderRegistry`
built fresh by `bootstrapProviders()` on every run, could ever actually route to a configured
hosted provider. This wasn't a style preference between two equally-valid routers; the old one had
a structural reason it could never have selected a real provider even with a valid key configured.

**Is routing genuinely dynamic or partially hardcoded?** Provider list, priority, and capability
filtering are all data-driven from `config/providers.default.json` + environment variables — no
hardcoded provider preference in the routing logic. The *capability* requested at each pipeline
call site is still a literal string in `pipeline.ts` (e.g. `capability: 'JSON_GENERATION'`) — there
is still no configuration layer mapping "phase → required capability" — but that capability now
flows through one real router instead of being hand-rolled per call site.

**Image generation** is now also routed (was: `AssetPipeline` calling `ComfyUIProvider`/
`DiffusersProvider` directly, bypassing both routers entirely) — see the new
`ImageProviderRegistry` (`packages/assets/src/image-router.ts`), which mirrors
`CapabilityRouter`'s exact ranking algorithm (filter by mode, sort by priority, health-check in
order) as a package-local implementation rather than a new cross-package dependency on
`@metroforge/ai` (`@metroforge/assets` never depended on it, and the shared logic — a filter and a
sort — didn't justify introducing one). `AssetPipeline.resolveImageGenerator()` now builds a
registry instead of hardcoded sequential provider tries; `LOCAL_ONLY` mode now genuinely excludes
non-local image providers (a no-op today since ComfyUI/Diffusers are both local, but real,
enforced policy the moment a hosted image provider exists). Live-verified this was a safe change
to already-working code: full regenerate, `--resume` checkpoint reuse (5/5 assets), and
`validate --runtime` (11 static gates + Godot import + 37 runtime checks) all still pass unchanged.

**Audio generation is not routed through a registry, deliberately.** `StableAudioProvider` is the
only real audio-enhancement provider that exists — an optional layer over always-available
procedural synthesis, not a second candidate to rank against. A registry with exactly one
candidate is ceremony, not routing; this is worth building the moment a second real audio provider
exists; it isn't yet.

---

## 9. Generation Pipeline

**Declared** vs **actually executed** phases — this distinction matters and is a real finding, not
editorializing. `packages/shared/src/constants.ts` declares `GENERATION_PHASES` with **38** phase
names, used to seed one `generation_stages` DB row per phase for every job
(`packages/database/src/repositories/job.ts:JobRepository.create()`). `packages/generation/src/pipeline.ts`
only calls `report(phaseName, ...)` — which is the only thing that ever updates a stage row past
`PENDING` — for **14** of those 38 names (verified by `grep -oP "report\('\w+'" pipeline.ts`):
`intake`, `game_dna`, `design_bible`, `world_topology`, `progression_graph`, `enemy_families`,
`bosses`, `quests`, `audio`, `environment_assets`, `project_assembly`, `static_validation`,
`automated_repair`, `final_qa`.

**Consequence**: for every real job, roughly 24 of 38 persisted `generation_stages` rows remain
`PENDING` forever, even though the work they nominally represent did happen (just folded into a
differently-named phase, or not implemented at all — see the table below).

| # | Phase (as reported) | Input | Output | AI capability | Procedural algorithm | Schema | Persisted to | Retry/fallback | File |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `intake` | CLI/IPC args | — (bookkeeping only) | none | none | — | DB stage row | none | `pipeline.ts` |
| 2 | `game_dna` | prompt/profile/seed | `GameDNA` | `json_generation` (real, see §8) | deterministic fallback generator | `GameDNASchema` | `game_dna.json` (checkpointed) | 3-provider fallback + deterministic ultimate fallback | `pipeline.ts` + `packages/ai/src/generators/game-dna.ts` |
| 3 | `design_bible` | `GameDNA` | art+audio bible | none | `generateDesignBible()` | ad hoc (not a named Zod export beyond field types) | `design_bible.json` | none | `packages/procedural/src/bibles.ts` |
| 4 | `world_topology` | seed/roomCount/abilities | `WorldGraph`+`ProgressionGraph`+roomIds | none | `generateWorldTopology()`, seeded RNG | `WorldGraphSchema`/`ProgressionGraphSchema` | `world_graph.json`, `progression_graph.json` (both written by assembler, not this phase directly) | none — **but now gates on `validateWorldConnectivity()`, added this session** | `packages/procedural/src/world.ts` |
| 5 | `progression_graph` | `ProgressionGraph`+`WorldGraph` | pass/fail | none | `validateReachability()` + `validateWorldReachability()` (both added/fixed this session) | — | warnings array | none (validation-only phase) | `packages/procedural/src/world.ts` |
| 6 | `enemy_families` | `GameDNA`+profile+seed | `Enemy[]` | none | `generateGameContent()` | `EnemySchema` | `data/enemies/enemies.json` (via assembler) | none | `packages/procedural/src/content.ts` |
| 7 | `bosses` | same call | `Boss[]` | none | same function | `BossSchema` | `data/bosses/bosses.json` | none | same |
| 8 | `quests` | same call | `Quest[]` | none | same function | `QuestSchema` | `data/quests/quests.json` (**never read by runtime — see §5**) | none | same |
| 9 | `audio` | `AudioBible`+seed | WAV+MIDI+Furnace files | none | `synthesizeAllSfx()`, `generateMusicFromAudioBible()` | — | `audio/`, `music/` dirs | Stable Audio enhancement attempted, gracefully skipped if worker absent | `packages/procedural/src/{audio,music,stable-audio}.ts` |
| 10 | `environment_assets` | `GameDNA`+`ArtBible`+seed | sprite/tileset PNGs | `image_generation` (ComfyUI/Diffusers, bypassing capability router — see §8) | procedural fallback always available | — | `assets/**/*.png` (checkpointed this session) | try AI, catch, fall back to procedural | `packages/assets/src/asset-pipeline.ts` |
| 11 | `project_assembly` | everything above | full Godot project | none | template copy + procedural scene/script/data writing | — | entire `GeneratedGames/<slug>/` tree | **hard failure** — pipeline returns `success:false` immediately if this fails | `packages/godot/src/assembler.ts` |
| 12 | `static_validation` | assembled project | pass/warn | none | 9 `QAValidator` gates + optional Godot headless | — | `validation_report.json` | none | `packages/qa/src/validator.ts` |
| 13 | `automated_repair` | failed QA report | repaired files (maybe) | none | 4 deterministic `RepairEngineer` cases | — | modifies project files in place | none | `packages/qa/src/validator.ts` |
| 14 | `final_qa` | re-validated report | pass/warn summary | none | count of passed/total gates | — | same `validation_report.json` | none | `pipeline.ts` |

**REAL vs MOCK vs PLANNED-ONLY, explicitly**: every phase in the table above is a **REAL
implementation** — there is no mocked/fake-progress phase anywhere in the currently-reported
pipeline (no `setTimeout`-simulated progress, confirmed by grep for `setTimeout` in `pipeline.ts`:
zero matches). The **PLANNED ONLY** phases are the 24 declared-but-never-reported names from
`GENERATION_PHASES` (`narrative_bible`, `biomes`, `player_mechanics`, `combat`, `abilities`,
`room_architecture`, `npcs`, `items_economy`, `art_direction`, `tilesets`, `character_assets`,
`enemy_assets`, `boss_assets`, `animation`, `ui_assets`, `vfx`, `godot_data`, `godot_scenes`,
`gdscript`, `import_validation`, `gameplay_validation`, `balance`, `polish`, `export`) — most of
their conceptual work does happen, just folded silently into one of the 14 real phases above
(e.g. "tilesets" work happens inside `environment_assets`), while some genuinely don't happen at
all (`npcs`, `vfx`, `ui_assets`, `export`, `balance`, `polish` — no code produces these).

---

## 10. Game DNA

- **Schema file**: `packages/schemas/src/core.ts`, `GameDNASchema` (Zod)
- **Major fields**: `version`, `identity` (title/tagline/genre/subgenre/tone/visualStyle),
  `technical` (resolution/tileSize/targetPlaytimeHours/difficulty), `combat`
  (style/meleeEnabled/rangedEnabled), `movement` (walkSpeed/runSpeed/jumpHeight/gravity),
  `abilities[]` (id/name/category/enabled), `world` (biomeCount/roomCount/regionCount),
  `narrative` (premise/protagonist/antagonist/centralConflict), `audio` (musicStyle/sfxStyle,
  optional), `seed`, `profile`
- **Generator**: `packages/ai/src/generators/game-dna.ts` `generateGameDNA()`
- **Validator**: `GameDNASchema.parse()` (Zod, throws on invalid shape) — used both when
  generating fresh and when resuming from a checkpoint (`GameDNASchema.parse(JSON.parse(...))` in
  `pipeline.ts`'s resume branch)
- **Storage**: `game_dna.json` in the project's output directory (also the resume checkpoint file)
- **Versioning**: `version` field is a free-form string, currently always `'0.1.0'`
  (`PRODUCT.schemaVersion` constant) — no migration logic exists for older Game DNA versions
- **Consumers, traced directly**: `generateWorldTopology()` (room count, biome count, ability
  list), `generateGameContent()` (enemy/boss/quest/item counts via `PROFILE_DEFAULTS[profile]`,
  boss lore string interpolates `gameDna.identity.title`), `generateDesignBible()` (visual
  style → palette), `AssetPipeline` (visual style → image prompts), `GodotProjectAssembler`
  (title → `project.godot` config/name and `Main.tscn` title text, movement values →
  `PlayerController.gd` exports, tileSize → room/tilemap dimensions)

**Does GameDNA actually control downstream generation?** Yes, genuinely, for the fields listed
above. **Not** for: specific enemy names/stats (hardcoded name pool + RNG, ignores
`GameDNA.identity.tone`/genre for flavor), specific ability mechanics (only `dash` has real
behavior regardless of what abilities are named in DNA), quest content (templated strings,
`GameDNA.identity.title` interpolated but no real narrative variety from `narrative.premise` etc.
beyond one boss lore line).

---

## 11. World Generation

File: `packages/procedural/src/world.ts` (387 lines), function `generateWorldTopology()`.

- **World graph**: `WorldGraph` — `nodes[]` (all type `'room'`), `edges[]` (main spine +
  branching shortcuts for medium/large worlds + vertical biome shafts + ability gates), `regions[]`
  (round-robin room assignment by biome index)
- **Biomes**: assigned per-room via `biomeIndex`/`regionIndex` metadata, distribution differs by
  world size tier (`isMedium`/`isLarge` booleans based on room count thresholds 30/50/150)
- **Rooms**: `room_000` through `room_NNN`, archetype assigned by `pickArchetype()` — deterministic
  rules (first=tutorial, last=boss, 30%-mark=ability_shrine, every 7th=save, every 5th=treasure,
  else random pick from `ROOM_ARCHETYPES`)
- **Connections**: main spine (every room to the next, bidirectional, unconditional) + up to 8
  branching shortcuts for 30+ room worlds + vertical biome-transition shafts + ability gates
- **Seeded RNG**: `SeededRNG` class (`packages/procedural/src/rng.ts`), verified deterministic by
  test (`SeededRNG.test` asserts identical sequences for identical seeds)
- **Critical path**: `progressionGraph.criticalPath` — literally the list of all progression node
  IDs in order, not a computed shortest-path
- **Loops**: branching shortcuts create loops in `WorldGraph` (not the abstract
  `ProgressionGraph`, which is always a strict linear chain)
- **Secrets**: `RoomSchema.secrets` field exists; **nothing populates it** — confirmed no
  `secrets:` assignment anywhere in `content.ts`/`world.ts` beyond the schema default (`[]`)
- **Boss placement**: always the last room in the sequence (`roomIds[roomIds.length - 1]`)
- **Ability placement**: `metadata.grantsAbilities` on the room immediately before its gate
  (added this session — see fix description in §5 "World generator" row); computed by
  `abilityGateRoomIndex(abilityIndex, abilityCount, roomCount)`, shared between node-tagging and
  edge construction so they can't drift apart
- **Save room placement**: every 7th room by index (`pickArchetype`) — archetype label only, no
  distinct save-room mechanic beyond the label (no in-game save point object exists — `SaveManager`
  is only ever triggered by the `save_triggered` EventBus signal, which nothing in the template
  currently emits, confirmed by grep for `save_triggered.emit` across all `.gd` files: **zero
  matches** — the save system is wired but nothing in the generated game ever calls it)
- **NPC placement**: N/A — no NPCs are generated (§5)

**Procedural vs AI**: 100% procedural/deterministic. No AI model is ever consulted for world
layout, room placement, or ability gating.

---

## 12. Metroidvania Progression

| Capability | Status | Path |
|---|---|---|
| Abilities | YES | `GameDNA.abilities[]`, gated via `WorldGraph` edges |
| Locks | PARTIAL | Only ability-based gates; no separate lock mechanic |
| Keys | NO | `RoomEntranceSchema.keyId`/`locked` fields exist, never populated |
| Ability gates | YES (fixed this session — was silently bypassable before) | `AbilityGate.tscn`/`.gd` in template, `WorldGraph` edges with `requirements: [ability]` |
| Boss gates | PARTIAL | Boss room is reachable via the main spine like any other room; no distinct "boss gate" mechanic beyond the boss room itself |
| Critical path | YES | `ProgressionGraph.criticalPath` |
| Optional paths | YES | branching shortcut edges (`optional: true`) in `WorldGraph`, only generated for 30+ room worlds |
| Sequence breaks | UNKNOWN/POSSIBLE | Not deliberately designed for, but branching edges without ability requirements could theoretically allow route variance; not tested |
| Reachability | YES (real, fixed this session) | `validateReachability()` (abstract chain) + `validateWorldReachability()` (real room graph, new this session) in `packages/procedural/src/world.ts` |
| Soft-lock detection | YES (consolidated this session) | Same two functions above are the soft-lock detectors; the previously-separate `detectSoftLocks()` wrapper was dead code and removed |
| Circular dependency detection | NO | Not implemented |
| Completion validation | PARTIAL | Graph-level proof that the boss room is reachable; no proof that combat/mechanics actually let the player *win* once there (that would require runtime simulation, which doesn't exist) |

---

## 13. Godot Template

Inspected every file in `templates/godot-metroidvania/scripts/` directly. Full breakdown:

| System | Present? | File(s) | Notes |
|---|---|---|---|
| Player | YES | `scripts/player/PlayerController.gd`, `scenes/player/Player.tscn` | `CharacterBody2D`, real coyote time (0.12s), jump buffer (0.1s) |
| Movement | YES | same | walk/run (via `move_down` held = run, unusual binding — not a run key, it's "hold down to run") |
| Combat | PARTIAL | `HealthComponent.gd`, `HitboxComponent.gd`, `HurtboxComponent.gd` | melee only, single attack, no combo/ranged despite `GameDNA.combat.rangedEnabled` |
| Health | YES | `HealthComponent.gd` | signals: `died`, `health_changed`, `damaged`; invulnerability flag exists but only ever set from `PlayerController`'s hit-received handler, not from `HealthComponent` itself |
| Damage | YES | `HitboxComponent.gd`/`HurtboxComponent.gd` (not fully read this pass, referenced consistently across Player/Enemy/Boss controllers) | |
| Abilities | PARTIAL | `dash` only has real mechanics in `PlayerController.gd`; ability *gating* (whether you have it) is generic via `GameManager.has_ability()` | |
| Enemies | PARTIAL | `AI/EnemyController.gd` | one behavior: patrol + contact damage |
| Bosses | PARTIAL | `AI/BossController.gd` | one behavior: timed attack + phase-threshold cooldown scaling |
| Rooms | YES | procedurally written `.tscn` per room by the assembler | |
| Transitions | YES | `world/RoomTransition.gd`/`.tscn`, `WorldManager.gd` | Area2D-triggered, ability-gated variant supported |
| Doors | PARTIAL | `RoomTransition` is the closest concept; no separate "door" object with open/close animation |
| Checkpoints | NO | No checkpoint object exists — save is manual-trigger only (and nothing triggers it, see §11) |
| Save/load | YES (mechanism), BROKEN (never invoked) | `SaveManager.gd` — real JSON persistence, but `save_triggered` signal is never emitted anywhere, so `save_game()` is never called during actual play. Godot's `_notification(NOTIFICATION_WM_CLOSE_REQUEST)` autosave is also not implemented |
| Inventory | NO | Not implemented |
| Items | PARTIAL | Generated as data (`data/items/items.json`); no pickup object, no inventory UI, no use-item mechanic |
| Quests | NO | Generated as inert data only (§5, §9) |
| Dialogue | NO | Not implemented |
| NPCs | NO | Not generated, no template scene/script exists |
| Map | NO | Not implemented |
| HUD | PARTIAL | `UI/GameHUD.gd` — health bar + ability list + victory overlay only |
| Pause menu | STUB | `GameManager.pause_game()`/`resume_game()` set `get_tree().paused = true/false` — no actual pause menu scene/UI exists to trigger or display it. The `pause` input action is defined in `project.godot` but **no script reads `Input.is_action_just_pressed("pause")` anywhere** (confirmed by grep) |
| Settings | NO | Not implemented |
| Audio | YES | **FIXED (later session)** — `AudioManager.gd` now real, see §5/§20 |
| Camera | PARTIAL | `WorldManager.gd`'s `_move_camera_to_room()` calls `camera.make_current()` on the player's child `Camera2D` — no camera bounds/room-locking logic, no smoothing configuration beyond whatever the template scene's default Camera2D settings are |
| VFX | NO | Not implemented |
| Input | YES | Full InputMap in `project.godot` — `move_left/right/up/down`, `jump`, `attack`, `dash`, `interact`, `pause` (note: `interact` and `pause` are defined but never read by any script — `interact` has zero `Input.is_action` references anywhere in the template) |
| Game completion | PARTIAL | `GameManager._on_boss_defeated()` sets `GameState.VICTORY` and emits `game_completed` if the boss id starts with `"final"` or equals `"boss_final"` — `GameHUD.gd` shows a `VictoryOverlay` on that signal. This **does** work end-to-end at the script level, contingent on the boss actually being defeatable (untested — no Godot runtime available) |

---

## 14. Godot Project Generation

Traced directly in `packages/godot/src/assembler.ts` (519 lines), method `assemble()`:

| Artifact | Generated? | How |
|---|---|---|
| `project.godot` | YES (patched, not authored) | `cpSync` from template, then `config/name` string-replaced with the game's title |
| Scenes | YES (rooms only; everything else copied verbatim) | Room `.tscn` files procedurally built per room (`buildRoomScene()`); `Player.tscn`/`Boss.tscn`/`Enemy.tscn`/`Main.tscn`/`World.tscn`/ability scenes are copied unchanged from the template (Main.tscn gets its title text replaced) |
| Scripts | NO (copied verbatim only) | All `.gd` files come from the template unmodified — the assembler never writes GDScript |
| Resources | PARTIAL | No `.tres` files generated; TileSet construction deferred to runtime (`RoomTileMap.gd`) |
| TileSets | PARTIAL | See above — built at runtime from a generated PNG, not pre-generated as a Godot resource |
| SpriteFrames | NO | Not generated anywhere |
| Input mappings | YES | Part of the copied-then-patched `project.godot` |
| Autoloads | YES | Part of the copied `project.godot` — 5 autoloads (`GameManager`, `EventBus`, `SaveManager`, `AudioManager`, `ProgressionManager`), unchanged from template |
| World data | YES | `world_graph.json`, `progression_graph.json`, `data/rooms/rooms.json` all written by the assembler |
| Rooms | YES | Real per-room `.tscn` generation, count matches `roomIds.length` |
| Enemies | PARTIAL | Data written (`data/enemies/enemies.json`); actual enemy **instances** are placed in room scenes via `ext_resource`/node instancing (verified: `[node name="Enemy" ... instance=ExtResource("2_enemy")]` pattern exists) — so enemies genuinely appear in generated scenes, just all sharing the one generic `Enemy.tscn`/`EnemyController.gd` behavior |
| Bosses | PARTIAL | Same pattern — boss instance placed in the boss room, one generic `Boss.tscn`/`BossController.gd` |
| Assets | YES | Textures (`assets/**/*.png`) written from `AssetPipeline` output |
| Audio | YES | Music/SFX files written to `music/`/`audio/` dirs (playback broken, see §5/§13) |
| UI | NO (beyond copied template UI) | No generated UI assets, template `GameHUD.gd`/`Main.tscn` used unchanged |

**Are generated projects actually self-contained?** Structurally yes — verified via
`asset_references_valid` QA gate (added this session) that every scene's `ext_resource` reference
resolves to a real file within the project directory; no reference to anything outside
`GeneratedGames/<slug>/`. **Functionally**, no — MetroForge doesn't need to keep running (correct
per spec §6), but the generated project itself has broken/missing systems documented throughout
this report (audio playback, quests, NPCs, inventory) regardless of whether MetroForge is running.

---

## 15. Godot Validation

- **Godot executable detection**: `packages/tools/src/registry.ts` `detectGodot()` — tries
  `"<customPath>" --version`, then `godot --version`, then `godot4 --version` via `execSync`.
  Custom path comes from `GODOT_EXECUTABLE` env var.
- **Headless commands**: `"<godotPath>" --headless --path "<projectPath>" --quit-after 1`, real
  `execSync` call with a 60-second timeout, in `packages/qa/src/validator.ts:validateGodotHeadless()`
- **Import validation**: inferred from headless output text — looks for `"Parse Error"`,
  `"Failed to load"`, `"ERROR:"` substrings in stdout
- **Script validation**: not separate — folded into the same headless-output text scan
- **Scene validation**: same
- **Runtime smoke testing**: the `--quit-after 1` flag makes Godot run one frame then exit — this
  is the closest thing to a smoke test, but it only proves the project *imports and boots*, not
  that gameplay systems function
- **Error parsing**: substring matching only, no structured error extraction (line numbers, file
  paths of the actual error aren't parsed out)
- **Repair loop**: `RepairEngineer.repair()` runs once if `QAValidator.validateProject()` (the
  static gates) or Godot headless fails; re-validates once after repair; **no retry limit
  mechanism beyond that single repair-then-revalidate pass** (not a bounded loop with a max
  attempts counter — it's inherently single-pass by construction)
- **Validation reports**: `validation_report.json` written to the project directory, containing
  `passed`, `results[]` (every gate), `timestamp`

**What has actually been tested successfully**: the 9 static QA gates (all live-verified this
session across multiple real generated projects, including deliberate corruption tests). **The
Godot headless path itself has never been exercised in this environment** — no Godot binary is
installed, confirmed by direct command failure. Every live pipeline run this session reported
`static_validation: SKIPPED (Godot not detected)`.

---

## 16. Asset Pipeline

| Asset type | Status | Notes |
|---|---|---|
| Image generation (general) | AI GENERATED (optional) / PROCEDURAL (fallback, always available) | |
| Concept art | NOT IMPLEMENTED | No distinct concept-art phase exists |
| Characters (player) | AI GENERATED or PROCEDURAL | `generateSprite()` in `asset-pipeline.ts`, checkpointed to disk this session |
| Enemies | AI GENERATED or PROCEDURAL | Same function, per-enemy |
| Bosses | AI GENERATED or PROCEDURAL | Same function |
| Tiles/tilesets | AI GENERATED or PROCEDURAL | Checkpointed this session; idempotency of the post-processing step was specifically verified before relying on buffer-reuse (see audit doc) |
| Backgrounds | PROCEDURAL only | Flat tinted `ColorRect` or the tileset texture itself — no distinct background art generation |
| Props | NOT IMPLEMENTED | No prop/decoration asset generation exists |
| Items/icons | PLACEHOLDER-adjacent | `Item.iconId` field exists in schema, never populated by any generator, no icon asset generation code |
| UI | NOT IMPLEMENTED | Template's built-in Godot UI nodes only |
| VFX | NOT IMPLEMENTED | |
| Sprite sheets | PROCEDURAL (walk cycle only) | `generateWalkCycleSheet()` |
| Animations | PROCEDURAL (walk only) | See §5 "Animation generation" |
| Audio (music/SFX) | PROCEDURAL, real synthesis, optional Stable Audio AI enhancement | |

---

## 17. Image Model Integration

Two functional backends, both real HTTP/subprocess adapters, neither exercised live in this
environment (no local server/worker running):

- **ComfyUI** (`packages/assets/src/providers/comfyui.ts`): workflow-JSON submission + polling.
  No ControlNet/IP-Adapter/LoRA wiring found in the submitted workflow structure — a fixed,
  minimal txt2img workflow only (not verified against the exact workflow JSON in this pass, but no
  conditioning-related code paths exist in the TypeScript adapter itself).
- **Diffusers** (`packages/assets/src/providers/diffusers.ts` + `workers/diffusers_image_worker.py`):
  subprocess-based, stdin/stdout JSON protocol. Model ID configurable via `DIFFUSERS_MODEL_ID` env
  var (default `stabilityai/sdxl-turbo` per `.env.example`).

Both support: seed passthrough (`ImageGenRequest.seed`), negative prompt, fixed width/height per
request. **Neither supports**: image-to-image, ControlNet, IP-Adapter, LoRA, inpainting,
outpainting, or batching — none of these parameters exist on `ImageGenRequest`
(`packages/assets/src/types/image-gen.ts`), confirmed by reading the full interface (4 fields
beyond profile/prompt: `negativePrompt`, `width`, `height`, `seed`).

**Output processing**: real — every generated image (AI or procedural) passes through
`PixelArtProcessor.process()` (resize/palette-quantize/alpha-cleanup/grid-align).

**Godot integration**: final PNGs are written directly into `assets/` and referenced via
`ext_resource` in generated scenes — no intermediate Godot import-settings file (`.import`) is
generated by MetroForge; Godot would generate those itself on first project open (untested, no
Godot binary available).

---

## 18. Sprite Pipeline

File: `packages/assets/src/pixel-art-processor.ts` (222 lines), class `PixelArtProcessor`.

| Step | Implemented? | Method |
|---|---|---|
| Background removal | NO | Not implemented — no ML-based or deterministic bg removal for AI-generated images |
| Segmentation | NO | |
| Cropping | NO (implicit only) | No explicit crop step found |
| Scale normalization | YES | `nearestNeighborScale()` — real nearest-neighbor resize |
| Palette normalization | YES | `quantizeToPalette()` — real nearest-palette-color mapping |
| Pixel processing | YES | `cleanupAlpha()` (binarize alpha at threshold), `alignToGrid()` (spread opaque neighbor color into near-transparent grid-edge pixels) |
| Frame alignment | PARTIAL | `alignToGrid()` covers per-tile alignment; no explicit animation-frame-boundary alignment logic found |
| Sprite-sheet packing | PARTIAL | `generateWalkCycleSheet()` produces a simple horizontal strip, not a packed/optimized atlas |
| Animation metadata | NO | No JSON sidecar describing frame count/timing is generated — `AnimatedSprite2D`/`SpriteFrames` wiring in Godot is not automated (see §13/§14) |
| Visual validation | PARTIAL | `VLMCritic` (Ollama vision model) or `runDeterministicAssetChecks()` fallback — both real, both verified live this session (both code paths exercised) |

**Idempotency note** (verified this session, load-bearing for the checkpoint feature added this
session): `PixelArtProcessor.process()` is a true no-op when re-applied to its own output at
matching dimensions/palette — traced through `nearestNeighborScale` (identity at same size),
`quantizeToPalette` (already-palette colors map to themselves), and `alignToGrid` (donor pixels
are never themselves mutated by the pass that reads from them).

---

## 19. Tileset Pipeline

- **Tile generation**: `generateTilesetSource()` (`packages/assets/src/png.ts`) — procedural, or
  AI-generated via ComfyUI/Diffusers with procedural fallback
- **Slicing**: `PixelArtProcessor.sliceTiles()` — real, slices a source image into `tileSize`×
  `tileSize` PNGs by grid position
- **Terrain creation**: not a distinct concept here — the sliced tiles are generic, no
  terrain-type classification (floor/wall/slope/etc.) beyond how `RoomTileMap.gd` happens to use
  tile index 0 for floor and tile index (0,0) for walls, hardcoded row/column assumptions
- **Seam handling**: `alignToGrid()` in `PixelArtProcessor` addresses transparent-pixel bleeding
  at tile edges; no explicit seamless-tiling verification
- **Collision generation**: **not tile-based** — collision in generated rooms comes from a single
  `StaticBody2D` "Floor" node with a `RectangleShape2D` covering the room width (verified in
  `assembler.ts`'s `buildRoomScene()`), not per-tile Godot TileSet physics layers
- **Terrain metadata**: none generated
- **Godot TileSet generation**: happens at **runtime** inside the generated game
  (`RoomTileMap.gd:_build_tilemap()`), not at generation time — confirmed by reading the script:
  it builds a `TileSetAtlasSource` and calls `create_tile()` for every cell in the source PNG, at
  `_ready()`
- **Biome integration**: tileset source path is `assets/tilesets/biome_%d/source.png`, biome index
  passed as an `@export` on the `RoomTileMap` node per room, matches the room's assigned biome

**Do generated TileSets actually load in Godot?** UNKNOWN — no Godot binary available to test.
The GDScript logic is plausible (uses documented Godot 4 `TileSetAtlasSource`/`TileSet` APIs
correctly as far as static reading can confirm) but this has not been runtime-verified in this or
(as far as this document's evidence shows) any prior session either.

---

## 20. Audio

- **Music generation**: `packages/procedural/src/music.ts` — real. `generateTrackerPattern()`,
  `synthesizeBiomeLoop()` (WAV synthesis), `generateMusicFromAudioBible()` (orchestrates per-biome
  generation), `exportPatternToMidi()` (real Standard MIDI File writer), `exportFurnaceModule()`
  (real Furnace tracker JSON interchange format writer)
- **SFX generation**: `packages/procedural/src/audio.ts` — real WAV synthesis,
  `synthesizeAllSfx()` covers a fixed `DEFAULT_SFX` list (jump/dash/hit/pickup/etc.)
- **Procedural audio**: yes, both music and SFX are procedurally synthesized (not sample-based,
  not AI-based by default)
- **Audio processing**: minimal — no post-processing pipeline (no normalization/compression pass
  found beyond whatever the synthesis functions do inline)
- **Loop generation**: `synthesizeBiomeLoop()` — real, seamless-loop-aware (not independently
  verified for actual audio seamlessness, only that the code produces a loop-length-aware buffer)
- **Godot audio integration**: **broken at the playback layer** — see §5/§13.
  `AudioStreamPlayer` is used correctly by `WorldManager.gd` for music (this one path works), but
  `AudioManager.gd` (the dedicated autoload meant to be the general audio interface) is
  non-functional, and no SFX ever plays in a generated game
- **AudioStream resources**: no `.tres` AudioStream resources are pre-generated; raw `.wav` files
  are loaded directly via `load(path)` at runtime (Godot can load `.wav` directly, so this works
  functionally, it's just not a "Resource" in the curated sense)
- **AudioBus configuration**: not found — no `default_bus_layout.tres` or bus configuration exists
  anywhere in the template or generated output
- **Which AI models are genuinely connected**: `StableAudioProvider`
  (`packages/procedural/src/stable-audio.ts`) — real subprocess-based enhancement of the
  procedurally-generated music, optional, gracefully skips if the worker is absent (verified live
  this session: enhancement was skipped with a warning, base procedural music still produced)

---

## 21. Job System

- **Job creation**: `JobRepository.create()` — real DB insert, creates one `generation_jobs` row
  and 38 `generation_stages` rows (all `GENERATION_PHASES`, initial status `PENDING`)
- **Phase execution**: sequential, in-process, `await`-chained inside
  `GenerationPipeline.run()` — **not** a queue, **not** concurrent, **not** resumable mid-phase
- **Persistence**: real (see above), but as established in §9, only 14/38 phase rows ever get
  updated past `PENDING`
- **Progress**: real-time via `onPhase` callback → IPC event (desktop) or console log (CLI) —
  verified live, progress genuinely streams during generation, not simulated
- **Cancellation**: NOT IMPLEMENTED — no cancel mechanism exists; once `pipeline.run()` starts,
  it runs to completion or throws
- **Pause**: NOT IMPLEMENTED — `'paused'` is a valid `GenerationJob.status` enum value in the
  schema, but nothing in `pipeline.ts` ever sets it or checks for it
- **Resume**: PARTIAL — `--resume` flag skips a fresh Game DNA generation if `game_dna.json`
  already exists on disk, and skips fresh sprite/tileset generation if the corresponding PNG
  already exists on disk (both added this session, both live-verified). **Does not** resume a
  crashed job from its DB `generation_jobs`/`generation_stages` state — the resume mechanism is
  entirely file-existence-based, not job-ID-based
- **Retry**: only within `FallbackManager.withFallback()`'s up-to-3-candidate-provider loop for
  the Game DNA phase specifically; no other phase has retry logic
- **Checkpointing**: file-based (game_dna.json, sprite/tileset PNGs), not DB-based
- **Crash recovery**: PARTIAL — if the process crashes mid-generation, a subsequent `--resume` run
  will skip whatever checkpointed files already exist on disk and recompute the rest. **The DB
  job/stage rows from the crashed run are simply abandoned** — a new `generation_jobs` row is
  created on the resumed run (verified: `pipeline.ts` always calls `db.jobs.create(...)`
  unconditionally, no lookup-existing-job-by-slug logic exists)
- **Concurrency**: NOT IMPLEMENTED — no concurrency control, no lock file, nothing prevents two
  `create`/`generate` invocations against the same slug from racing each other
- **Queue implementation**: NONE — confirmed no queue library (no BullMQ, no in-memory queue class)
  anywhere in `package.json` dependencies or source

**Do jobs survive application restart?** Partially and by accident, not by design: the *files*
survive (that's just the filesystem), and `--resume` can pick some of them back up, but the *job
tracking* (DB rows) does not meaningfully survive in the sense of "resume this exact job" — every
invocation creates a fresh job row regardless of whether a matching project/slug already has an
abandoned job.

---

## 22. Database

Schema (`packages/database/src/migrations.ts`, single migration, version 1):

| Table | Columns | Repository | Actually written to? |
|---|---|---|---|
| `schema_migrations` | version, applied_at | (internal to migration runner) | YES |
| `projects` | id, slug (unique), title, description, profile, mode, seed, output_path, status, created_at, updated_at | `ProjectRepository` | YES |
| `generation_jobs` | id, project_id, correlation_id, profile, mode, seed, status, current_phase, created_at, updated_at | `JobRepository` | YES |
| `generation_stages` | id, job_id, phase, status, started_at, completed_at, error, artifacts_json | `JobRepository` | YES (partially — 14/38 phases ever leave PENDING, §9/§21) |
| `artifacts` | id, job_id, type, path, provider, model, prompt_hash, seed, license, timestamp, validation_state, fallback_generated, metadata_json | **none** | **NO — confirmed zero INSERT statements anywhere in source** |
| `validation_results` | id, project_id, gate, passed, message, details_json, timestamp | **none** | **NO — confirmed zero INSERT statements anywhere in source** |
| `settings` | key, value | **none** | **NO — confirmed zero INSERT statements anywhere in source** |

**Migration system**: `runMigrations()` in `migrations.ts` — a real, simple versioned-SQL-string
runner (tracks applied versions in `schema_migrations`, idempotent). Only one migration exists
(`version: 1`) since this is the initial schema.

**Missing persistence**: artifacts, validation results, and settings are all designed-for in the
schema but implemented as flat JSON files on disk instead
(`generation_manifest.json`/`validation_report.json`/nothing-for-settings respectively) — the SQL
tables for them are pure dead weight right now. This is a genuine architectural inconsistency: two
different persistence strategies exist for conceptually similar data (jobs/projects in SQL,
artifacts/validation in JSON files), with no clear documented reason for the split, and the SQL
half for artifacts/validation was simply never finished.

---

## 23. Frontend

All 7 screens from `apps/desktop/src/App.tsx`, every one directly read this session:

| Screen | Classification | Real backend or mock? |
|---|---|---|
| Create | FUNCTIONAL | Real — calls `generateGame` IPC, subscribes to live progress events, renders real phase list and real success/error/warning output |
| Projects | FUNCTIONAL | Real — calls `listProjects` IPC, which reads the actual `GeneratedGames/` directory and parses each project's real `game_dna.json` |
| Generation | PARTIAL (intentionally minimal) | Not broken — it's a static informational panel by design ("Use the Create screen..."), no backend call at all. Not a bug, but also not really a distinct "Generation" screen — duplicates what Create already shows live |
| Models | FUNCTIONAL | Real — calls `listModels`/`getHardwareProfile`/`scoutModels` IPC, all backed by real catalog/hardware-profiler/scout code |
| Providers | FUNCTIONAL | Real — calls `listProviders` IPC → real `bootstrapProviders()` + `listProviderStatus()` |
| QA | FUNCTIONAL | Real — calls `runDoctor` IPC → real `ToolRegistry.detectAll()` |
| Settings | FUNCTIONAL (read-only) | Real — calls `getConfig` IPC, displays 2 real config values. No mutation capability exists (not a bug relative to what it claims — it explicitly says "Edit .env") |

**Buttons that do nothing**: none found — every button in every screen has a real `onClick`
wired to a real IPC call. The closest thing to "does nothing" is the Generation screen having no
interactive elements at all (by design, not a broken button).

**Mock/static data**: none found anywhere in `App.tsx` — confirmed by reading the entire file;
every `useState` that holds displayed data is populated from an `await window.metroforge.*()`
call, never from a hardcoded array (aside from the `NAV_ITEMS` navigation labels themselves, which
aren't "data" in the mock-data sense).

---

## 24. CLI

All commands verified against `apps/cli/src/index.ts` registration and each command file's source.
**Every command below genuinely works** — this session ran `doctor`, `create`, and `validate`
live multiple times, and `providers`/`models`/`scout` were read in full and match the same real
patterns already verified live for the others.

| Command | Syntax | Genuinely works? |
|---|---|---|
| `metroforge doctor` | `metroforge doctor` | YES — live-verified this session |
| `metroforge create` | `metroforge create --prompt <text> [--profile <p>] [--mode <m>] [--seed <n>] [--no-generate] [--resume]` | YES — live-verified extensively this session (dozens of real generations across all 4 profiles) |
| `metroforge generate <slug>` | `metroforge generate <slug> [--profile <p>] [--mode <m>] [--seed <n>] [--resume]` (resume defaults to `true` here, unlike `create`) | YES — **FIXED (later session)**: `project.json` (schema: `ProjectMetadataSchema` in `packages/schemas/src/core.ts`) is now genuinely written by every `create`/`generate` run, validated with Zod on read (not blind `JSON.parse`), and used as the fallback for profile/mode/seed too, not just the prompt — explicit CLI flags still take priority. `createdAt` is preserved across regenerations; `lastGeneratedAt` updates each run. Added to `required_files`, so a project missing it now fails static validation instead of silently regenerating wrong. Live-verified: generated with `--profile SMALL --seed 777`, ran bare `generate <slug>` with no flags, confirmed via the regenerated `game_dna.json` that SMALL/777 were genuinely re-applied (50 rooms, not TINY_TEST's 8; seed 777, not the old hardcoded default of 42) |
| `metroforge providers` | `metroforge providers` | YES (real pattern, not live-re-verified this exact command this session, but reads identically to the desktop IPC handler already verified) |
| `metroforge validate <slug> [--repair]` | `metroforge validate <slug> --repair` | YES — live-verified extensively this session, including a full corrupt→repair→pass cycle |
| `metroforge models list [--capability][--installed][--local][--low-vram][--modality]` | | YES (real catalog read) |
| `metroforge models rank <capability> [--mode]` | | YES (real ranking call) |
| `metroforge models starter-pack` | | YES (real, but see §6 — starter pack IDs are hardcoded, not cross-validated) |
| `metroforge models download <modelId> [--approve]` | | YES (real, approval-gated, real subprocess download adapters) |
| `metroforge scout [--benchmark][--source]` | | YES (real, Ollama-only discovery in practice since `huggingface`/`builtin` sources aren't implemented in `ModelScout.refresh()`) |

No planned-but-unimplemented commands are registered — everything in `index.ts` maps to a real
handler.

---

## 25. Tests

Ran `pnpm test` this session. Result: **17 test files, 59 tests, 59 passed, 0 failed, 0 skipped**.

| File | What it tests |
|---|---|
| `packages/ai/src/model-benchmark.test.ts` (5) | `ModelBenchmarkService` — real Ollama probe with mocked `fetch`, plus heuristic fallback paths |
| `packages/ai/src/model-catalog.test.ts` (2) | `ModelCatalogService` load/filter |
| `packages/ai/src/model-download-manager.test.ts` (2) | Download plan generation, approval gating |
| `packages/assets/src/asset-pipeline.test.ts` (2) | Full procedural asset generation pass; checkpoint/resume behavior including byte-identical reuse of sprites and tilesets, and re-sliced tile correctness |
| `packages/assets/src/png.test.ts` (4) | Low-level PNG encode/decode round-trip |
| `packages/godot/src/assembler.test.ts` (1) | Full `assemble()` call against a minimal fixture, asserts success and file presence |
| `packages/procedural/src/audio.test.ts` (2) | SFX synthesis |
| `packages/procedural/src/bibles.test.ts` (2) | Design bible generation |
| `packages/procedural/src/content.test.ts` (2) | Game content generation |
| `packages/procedural/src/music.test.ts` (2) | Music/MIDI/Furnace generation |
| `packages/procedural/src/world-medium.test.ts` (4) | World generation at medium/large room-count tiers (branching logic) |
| `packages/procedural/src/world.test.ts` (10) | `SeededRNG` determinism, room count, `validateReachability` (including a test proving the ability-gate fix is load-bearing, not vacuous), `validateWorldConnectivity`, `validateWorldReachability` (including a test that caught the free-duplicate-edge bug this session) |
| `packages/qa/src/validator.test.ts` (11) | `RepairEngineer` (manifest recreation, InputMap restoration, Player.tscn/Main.tscn/project.godot restoration with title reapplication, no-op-when-passing), `QAValidator` (missing-files gate, world connectivity pass/fail, asset-reference pass/fail) |
| `packages/schemas/src/bibles.test.ts` (2) | Bible schema validation |
| `packages/schemas/src/core.test.ts` (2) | Core schema validation |
| `packages/schemas/src/game.test.ts` (4) | Game schema validation |
| `packages/core/src/product.test.ts` (2) | Version string formatting |

**Not tested at all** (confirmed by absence of any matching `.test.ts` file): the desktop app
(`App.tsx`, `handlers.ts`, `main.ts`, `preload.ts`), every CLI command file, both database
repositories, `packages/database/src/{sqlite,node-sqlite,sqljs}.ts`, every AI provider HTTP
adapter (`ollama.ts`, `gemini.ts`, `groq.ts`, `openrouter.ts`, `huggingface.ts`,
`base-http.ts`), `packages/ai/src/{bootstrap,registry,generation-router,hardware-profiler,
model-scout}.ts`, `packages/tools/src/registry.ts`, `packages/generation/src/pipeline.ts` itself
(the orchestrator has zero direct unit tests — it's only exercised via live CLI runs, which are
real but not part of the automated `pnpm test` suite).

---

## 26. Build Validation

All commands run fresh in this environment during this inspection pass, from repo root, after
adding Node/pnpm to `PATH` (`C:\Program Files\nodejs`, `%APPDATA%\npm`):

```bash
node --version    # v24.19.0
pnpm --version    # 10.15.0

pnpm install
# Scope: all 14 workspace projects
# Lockfile is up to date, resolution step is skipped
# Already up to date
# apps/desktop postinstall$ node ./node_modules/electron/install.js
# apps/desktop postinstall: Done
# → exit 0

pnpm build
# pnpm -r run build
# All 13 packages: tsc -p tsconfig.json → clean
# apps/cli: tsc -p tsconfig.json → clean
# apps/desktop: tsc -p tsconfig.electron.json && vite build (×3: renderer, main, preload) → clean
# → exit 0

pnpm typecheck
# pnpm -r run typecheck (tsc --noEmit per package)
# → 0 errors, exit 0

pnpm test
# vitest run
# Test Files  17 passed (17)
# Tests  59 passed (59)
# Duration ~4.5s
# → exit 0

pnpm lint
# eslint . --ext .ts,.tsx
# 0 errors, 0 warnings
# → exit 0
```

**No changes were made to the codebase to produce these results** — this is the state of the
repository as of commit `0ac681f` plus the uncommitted changes listed in §1 (all made in a prior
session, not during this inspection).

---

## 27. Godot Validation Test

**Not executable in this environment.** `godot --version` and `godot4 --version` both fail with
"command not found." No Godot installation was found via `packages/tools/src/registry.ts`'s
detection logic either (verified via live `doctor`/`validate` runs earlier in this project's
history, consistently reporting `godot_imports: Skipped — Godot not detected`).

Three real generated projects exist locally under `GeneratedGames/` (`crystal-caverns-test`,
`ruined-mechanical-temple-metroidvania`, and whatever the most recent live-verification run left
behind) that **could** be used for this test if Godot were available — none of this document's
claims about actual Godot runtime behavior (§13 rows marked UNKNOWN, §19's TileSet-loads-in-Godot
question, boss-defeat victory flow) can be upgraded from "code looks plausible" to "verified" until
that binary is available.

---

## 28. Security Audit

Concrete findings, each traced to source:

1. **API keys**: read only from `process.env` (`GEMINI_API_KEY` etc.), never written to disk by
   MetroForge itself, never sent to the frontend (`.env.example`'s own comment confirms this
   intent and the code matches it — provider construction happens in the Electron **main**
   process / CLI process only, never in the renderer). **No secret redaction in logs** was found —
   if a provider error message happened to include a key (e.g. in a URL), `packages/shared/src/logger.ts`
   would print it verbatim; not verified whether any current error path actually leaks a key, but
   no defensive redaction exists either.
2. **Electron IPC**: `contextIsolation: true`, `nodeIntegration: false` — correct. Exactly 10
   whitelisted channels via `contextBridge`, no `remote` module usage, no arbitrary
   `ipcRenderer.send`/`invoke` exposed to the renderer beyond the wrapped methods. **Good posture.**
3. **Shell execution / child processes**: `execSync` used in `hardware-profiler.ts` (GPU query,
   `nvidia-smi`), `model-download-manager.ts` (`huggingface-cli download <repo>` —
   **`repo` is interpolated directly into a shell string** from `model.repository`, which comes
   from the model catalog JSON, not user input at generation time, but **is** attacker-controlled
   if a malicious catalog entry were ever merged via `mergeDiscovered()` from an untrusted scout
   source), `assembler.ts`/`validator.ts` (Godot headless — `godotPath`/`projectPath` interpolated
   into a shell string, `godotPath` comes from `.env`/config, `projectPath` is server-controlled
   but built from a `slugify()`'d slug so not directly injectable), `qa/src/validator.ts`,
   `tools/registry.ts` (fixed command strings, no interpolation), `doctor.ts` (`pnpm --version`,
   fixed).
   **Concrete gap**: `model-download-manager.ts`'s HuggingFace/Diffusers adapters build shell
   command strings via template literals (`` `huggingface-cli download ${repo} --local-dir "${targetDir}"` ``)
   without shell-escaping `repo`. `repo` is derived from `model.repository` after stripping the
   `https://huggingface.co/` prefix — if a catalog entry (local JSON file today, but designed to
   be scout-discoverable in the future) contained shell metacharacters in that field, this would
   be a real command-injection surface. **Not exploitable today** because the catalog is a
   static, repo-local JSON file and `ModelScout` only discovers from Ollama's own `/api/tags`
   (which doesn't populate `repository`), but the code pattern itself is unsafe and would become
   exploitable the moment any remote/user-editable catalog source is added.
4. **Path traversal**: `slugify()` (`packages/shared/src/constants.ts`) strips project-provided
   text to `[a-z0-9-]` before it's used to build `GeneratedGames/<slug>/` paths — real, effective
   mitigation for the one place user-provided text becomes a directory name. No other
   user-controlled path construction was found (asset paths, room IDs, etc. are all
   internally-generated, not user input).
5. **Archive extraction**: none found anywhere in the codebase — no zip/tar extraction logic
   exists, so there's no zip-slip surface to audit.
6. **Model downloads**: real approval gate — `ModelDownloadManager.download()` throws unless
   `request.approved === true`, and the CLI requires an explicit `--approve` flag (confirmed:
   without it, `models download <id>` only prints a plan and returns). **Good.**
7. **Generated code execution**: MetroForge never executes GDScript itself — it writes files that
   *Godot* would execute, and Godot execution only happens via the explicit, developer-configured
   headless validation path (opt-in via `GODOT_EXECUTABLE`/detection), not automatically on every
   file write. No `eval`/`new Function`/`vm` usage found anywhere in TypeScript source.
8. **File writes**: no path-traversal guard was found specifically at the point where
   `AssetPipeline`/`GodotProjectAssembler` write files using `asset.path`/relative paths derived
   from internally-generated IDs (e.g. `assets/tilesets/biome_${b}/source.png`) — these are all
   template-literal-constructed from numeric loop indices, not from any external/AI-generated
   string, so not currently exploitable, but there is no explicit `path.resolve()` +
   "must stay under outputDir" assertion anywhere as defense in depth.

---

## 29. Dependencies

Key runtime dependencies (from each package's `package.json`, read directly):

- **zod** `^3.24.1` — the only schema/validation library, used pervasively and consistently
  (no competing validation library found — no `yup`, no `joi`, no `ajv`)
- **commander** `^12.1.0` — CLI framework
- **electron** `^33.2.1` — desktop shell
- **react** `^18.3.1` / **react-dom** `^18.3.1` — frontend
- **sql.js** `^1.12.0` — WASM SQLite (used by both `packages/database` directly and as the
  Electron-runtime fallback in `sqlite.ts`)
- **vite** `^6.0.3`, **vite-plugin-electron** `^0.28.8`, **vite-plugin-electron-renderer** `^0.14.6` — desktop build tooling
- **vitest** `^2.1.8` — test runner
- **typescript** `^5.7.2`, **eslint** `^9.16.0` + **typescript-eslint** `^8.18.0` — tooling

**No dependency on**: any AI SDK (`openai`, `@anthropic-ai/sdk`, `@google/generative-ai`, etc.) —
**all provider calls are hand-rolled `fetch`**, not vendor SDKs. This is consistent with the
"model-agnostic, no vendor lock-in" architectural goal but means no SDK-provided retry/streaming/
type-safety benefits are used anywhere.

**Unused/dead dependencies**: none identified with high confidence in this pass — the dependency
list per package is small and each entry maps to a real, traced usage.

**Duplicate/redundant packages**: `sql.js` appears as a direct dependency in both
`packages/database` and `apps/desktop` — not a bug (desktop needs it directly for its Electron
runtime environment reasons, database package needs it as its own fallback implementation), but
worth noting as the one place a dependency is declared twice across the workspace.

**Known architectural redundancy** (dependency-adjacent, covered fully in §31): two competing
capability-routing class hierarchies exist in `packages/ai` without an external dependency being
the cause — this is in-house duplication, not a dependency problem.

---

## 30. Technical Debt

| Item | Rank | Consequence |
|---|---|---|
| ~~SFX generated but never played (`AudioManager.gd` stub)~~ — **FIXED (later session)** | — | Was CRITICAL; now real, live-verified against actual Godot execution (3 dedicated runtime smoke-test checks) |
| ~~`GenerationRouter` fully bootstrapped, zero call sites~~ — **FIXED (later session)** | — | Was HIGH; now the canonical facade, delegating to `CapabilityRouter`/`FallbackManager`, with `pipeline.ts` actually calling it |
| `artifacts`/`validation_results`/`settings` DB tables never written | **HIGH** | Schema promises persistence that doesn't exist; any code written against these tables today (a query, a migration assuming data is there) would silently return nothing rather than erroring, a dangerous silent-failure shape |
| 24 of 38 declared `GENERATION_PHASES` never reported, DB stage rows stuck at PENDING forever | **HIGH** | Any UI or tooling built against `generation_stages` to show "true" progress would be wrong for most of the declared phases; misleads anyone who trusts the DB over the live IPC event stream |
| Quests/items generated as inert JSON, never read by the runtime | **MEDIUM** | Real generation work (LLM-agnostic, deterministic, tested) produces content that has zero player-facing effect — wasted computation and a misleading "quests: PASSED (N quests)" pipeline message that implies more than is true |
| NPCs entirely unimplemented despite a complete schema | **MEDIUM** | Schema/design intent exists (`NPCSchema`, `Room.npcs`, `PROFILE_DEFAULTS[profile].npcs` counts) with zero corresponding generator or runtime — anyone reading the schema would reasonably assume NPCs work |
| `pause`/`interact` input actions defined but never read by any script | **LOW** | Dead InputMap entries — cosmetic, but indicates the template's input surface has drifted from what's actually wired |
| `save_triggered` signal never emitted anywhere | **MEDIUM** | The save system is fully implemented but functionally unreachable in actual play — a player could never save without a MetroForge/template change |
| Duplicate Godot-headless-validation logic (`assembler.ts:validate()` vs `validator.ts:validateGodotHeadless()`) | **LOW** | `assembler.ts`'s version is dead code (zero call sites) but risks silent behavioral drift if someone edits one copy assuming it's the one in use |
| Command-injection-shaped pattern in HuggingFace/Diffusers download adapters | **MEDIUM** (not currently exploitable, but the pattern itself is the debt) | Becomes a real vulnerability the moment any remote-sourced catalog data reaches `model.repository` without validation |
| No tests for the desktop app, CLI, database, or AI provider adapters | **MEDIUM** | Large, real, working surfaces have zero regression protection; a future change could silently break IPC contracts or provider HTTP shapes with no automated signal |

---

## 31. Duplicate Systems

Explicitly searched for and found:

- **Capability/generation routing — FIXED in a later session, see §8.** `GenerationRouter` was
  rewritten as a thin facade delegating to `CapabilityRouter`/`FallbackManager` rather than
  reimplementing ranking from `ModelCatalogService`, and `packages/generation/src/pipeline.ts` was
  migrated to call `generationRouter.generate()` for Game DNA (verified by grep: no remaining
  direct `fallback.withFallback()` call site in the pipeline). No longer two competing systems.
- **Godot headless validation**: `packages/godot/src/assembler.ts:GodotProjectAssembler.validate()`
  (dead, zero call sites, confirmed by grep) vs. `packages/qa/src/validator.ts:QAValidator.
  validateGodotHeadless()` (the one actually called from `pipeline.ts`). Near-identical
  `execSync` invocation, different error-detail handling.
- **Provider/asset-generation interface duplication**: `packages/ai/src/provider-plugin.ts`
  defines `ImageGenerationProvider`, `VisionAnalysisProvider`, `AudioGenerationProvider`,
  `BackgroundRemovalProvider`, `SegmentationProvider`, `EmbeddingProvider`, and
  `ProviderPluginRegistry` — **none of these are implemented or instantiated anywhere** (confirmed
  by grep: only re-exported from `packages/ai/src/index.ts`, never consumed). The **actually-used**
  image generation interface is a completely separately-defined `ImageGenerator` in
  `packages/assets/src/types/image-gen.ts`, implemented by `ComfyUIProvider`/`DiffusersProvider`.
  This is a second, larger instance of the same "designed twice, only one half built" pattern.
- **Soft-lock detection**: previously `detectSoftLocks()` (a dead one-line wrapper around
  `validateReachability()`) — found and removed this session, see `docs/CLAUDE_REPOSITORY_AUDIT.md`
  item 9. No longer duplicated as of this document's writing.

**Explicitly checked, NOT duplicated**: `ToolRegistry` (single implementation,
`packages/tools/src/registry.ts`), `JobManager`/job creation (single path through
`JobRepository`, no competing job system), `GameDNA` (single schema, single generator), `WorldGenerator`
(single `generateWorldTopology()`), `ProgressionGraph` (single generation path, though now two
complementary — not competing — validation functions as documented in §5/§12), `AssetRegistry`
(single `generation_manifest.json` writer in `assembler.ts`), `GodotProjectGenerator` (single
`GodotProjectAssembler` class), `Settings` (no real implementation exists to be duplicated — see
§5), `Logger` (single `packages/shared/src/logger.ts`, no competing logger found).

---

## 32. What Actually Works End-to-End?

**The longest workflow that currently works without mocks**, verified live, repeatedly, this
session and in the session immediately prior (evidence trail in `docs/CLAUDE_REPOSITORY_AUDIT.md`):

```
CLI prompt
  → Game DNA (deterministic fallback path, since no LLM is reachable in this environment)
  → Design Bible (art + audio, procedural)
  → World Topology + Progression Graph (procedural, seeded, now correctly ability-gated)
  → World Connectivity + World Reachability validation (PASS)
  → Enemy/Boss/Quest/Item content generation (procedural)
  → Audio (real WAV/MIDI/Furnace synthesis)
  → Environment Assets (procedural sprites/tilesets, checkpointed)
  → Godot Project Assembly (real scenes/scripts/data written on top of the copied template)
  → Static QA Validation — 9/9 gates PASS
  → (Godot headless validation SKIPPED — no Godot binary in this environment)
  → generation_manifest.json + validation_report.json written
  → CLI reports success, prints the output path
```

This full chain was run this session across TINY_TEST (8 rooms), MEDIUM (90–105 rooms), and LARGE
(217–233 rooms) profiles and multiple seeds, every time producing a structurally valid, self-
referentially-consistent Godot project directory that passes every currently-implemented static
check.

**Exact point where it stops being "verified working" and becomes "plausible but unconfirmed":**
Godot actually importing and running the project. Everything after "Static QA Validation" in the
chain above is `NEEDS_VALIDATION`, not `COMPLETE` — there is no Godot binary in this environment
to close that gap, and this document does not claim otherwise.

---

## 33. Current Playable Game Status

| Question | Answer | Evidence |
|---|---|---|
| Can MetroForge currently generate a Godot project? | **YES** | Verified repeatedly this session; real files on disk, real scene/script/data structure, passes 9/9 static QA gates |
| Can Godot import it? | **UNKNOWN** | No Godot binary available in this environment to test. Structurally plausible (valid `.tscn`/`project.godot` syntax as far as static text inspection can confirm) but never actually opened in the Godot editor or headless runtime in this session |
| Can the game launch? | **UNKNOWN** | Same reason |
| Can the player move? | **UNKNOWN** (code exists and looks correct) | `PlayerController.gd` implements real `CharacterBody2D` physics with coyote time/jump buffer; never runtime-tested |
| Does combat work? | **UNKNOWN** (code exists, melee only) | `HitboxComponent`/`HurtboxComponent`/`HealthComponent` wired consistently across Player/Enemy/Boss; never runtime-tested. Ranged combat does not exist regardless of `GameDNA.combat.rangedEnabled` |
| Do enemies work? | **UNKNOWN** (code exists, one behavior) | Patrol + contact damage only; never runtime-tested |
| Does ability progression work? | **PARTIALLY YES at the data/graph level, UNKNOWN at runtime** | The ability-gate-bypass bug (§5, world generator row) was found and fixed this session and verified via graph-level reachability proofs and direct edge-list inspection — this is genuinely solid evidence the *design* is now correct. Whether `AbilityGate.gd`/`AbilityPickup.gd` correctly enforce this at Godot runtime is untested |
| Does a boss work? | **UNKNOWN** (code exists, one generic attack pattern) | `BossController.gd` — phase-threshold logic looks correct by inspection; never runtime-tested |
| Does save/load work? | **NO, effectively** | The mechanism is real (`SaveManager.gd`) but `save_triggered` is never emitted anywhere in the template — confirmed by grep, zero matches. A player could never trigger a save through normal play as currently wired |
| Can the game reach an ending? | **PARTIALLY** — the win-condition code path exists and is graph-verified reachable, but is otherwise **UNKNOWN** at runtime | `GameManager._on_boss_defeated()` correctly sets victory state if the final boss dies; whether the final boss is actually *beatable* by a player given the implemented combat depends on untested runtime balance |
| Can a generated project be exported independently? | **YES, trivially, but there is no distinct "export" feature** | The generated directory already doesn't depend on MetroForge continuing to run (correct per the original spec's requirement) — but there's no packaging step, no `export_manifest.json`, no "prototype vs. commercial-safe" mode. "Export" today just means "the folder that was already written" |

---

## 34. Missing Implementation

### P0 — required for a functional vertical slice
- **Wire SFX playback**: implement `AudioManager.gd`'s three stub methods and call them from
  `PlayerController.gd`/`EnemyController.gd`/`HitboxComponent.gd` at the appropriate moments.
  Affects: Godot runtime template only. No pipeline changes needed — the audio files already
  exist on disk with predictable paths.
- **Wire the save trigger**: emit `EventBus.save_triggered` from somewhere reachable in normal
  play (a save-room interaction, a periodic autosave, or a pause-menu "Save" button — the pause
  menu doesn't exist either, see below). Affects: Godot runtime template.
- **Verify against a real Godot binary**: everything in §33 marked UNKNOWN needs an actual Godot
  4.3 install to close. This is the single highest-leverage next action — nearly every other
  finding in this document is downstream of "we don't actually know if the generated project
  runs."
- ~~Fix `metroforge generate <slug>`'s dead prompt-recovery path~~ — **FIXED (later session)**:
  `project.json` is now written on `create` (`ProjectMetadataSchema` in `packages/schemas/src/
  core.ts`) and validated on read.

### P1 — required for complete game generation
- Implement a pause menu scene (`pause` input action already exists, unused).
- ~~Decide the fate of `GenerationRouter`~~ — **FIXED (later session)**: it's now the canonical
  facade, delegating to `CapabilityRouter`/`FallbackManager` rather than competing with them. See §8.
- Decide the fate of `packages/ai/src/provider-plugin.ts`'s unimplemented interfaces
  (`VisionAnalysisProvider`, `AudioGenerationProvider`, `BackgroundRemovalProvider`,
  `SegmentationProvider`, `EmbeddingProvider`) — either implement real adapters behind them or
  remove the aspirational interfaces so the codebase doesn't imply capabilities that don't exist.
- Either wire `data/quests/quests.json` and `data/items/items.json` into actual runtime systems
  (quest tracking, inventory/item pickup) or stop generating them as if they matter.
- Implement NPCs (schema exists, `PROFILE_DEFAULTS` already budgets a count per profile — the
  generator and the runtime scene/script are both entirely missing).
- Finish the `artifacts`/`validation_results`/`settings` DB persistence, or formally drop those
  tables from the schema and document that JSON files are the real source of truth.
- Reconcile `GENERATION_PHASES` (38 names) with what `pipeline.ts` actually reports (14 names) —
  either report all of them accurately (splitting phases like `environment_assets` into the finer-
  grained `tilesets`/`character_assets`/etc. the constant already anticipates), or shrink the
  constant to match reality.

### P2 — quality improvements
- Ranged combat implementation (data field exists, unused).
- Enemy behavior variety beyond patrol (movement enum already has `fly`/`hover`/`charge`/etc. with
  zero corresponding GDScript).
- Boss attack-name dispatch (currently one hardcoded attack regardless of the generated `attacks`
  list).
- Idle/jump/attack/hurt/death sprite animations (only walk-cycle exists today).
- ControlNet/IP-Adapter/LoRA/img2img support for the image providers (interfaces don't even have
  the fields yet).
- Dynamically-constructed runtime asset path validation (audio/tileset-by-ID loads aren't covered
  by `asset_references_valid`).
- Background-removal/segmentation for AI-generated character art before pixel-art processing.
- Cross-platform GPU/VRAM detection (currently Windows-only).
- Fix the shell-interpolation pattern in the HuggingFace/Diffusers download adapters before any
  remote-sourced catalog data is introduced.

### P3 — advanced/future functionality
- Dialogue system, map/minimap, inventory UI, shop/economy.
- Speech generation/recognition.
- 3D generation.
- Embeddings/RAG project memory.
- Multi-provider streaming responses.
- An actual simulated-agent playtester (beyond graph-level reachability proofs).

---

## 35. Recommended Next Implementation Order

Dependency-aware, based on what this inspection actually found (not a generic roadmap):

Items 1–4 below are **DONE (later session)**, kept here as a record of the order they were
actually tackled in:

1. ~~Install/acquire a Godot 4.3 binary~~ — **DONE**: a real Godot 4.7.1 binary was found and
   wired in, unblocking real runtime verification (see §32/§33 updates and `docs/
   IMPLEMENTATION_STATUS.md`). This also surfaced and fixed a real P0 bug: `.env` was never
   actually loaded anywhere in the codebase (no `dotenv`, no manual parsing) — fixed in
   `packages/shared/src/config.ts`.
2. ~~Fix `AudioManager.gd`'s three stub methods~~ — **DONE**: real pooled SFX playback, music
   switching, wired to jump/dash/hit/death/boss-hit/ability events via a central
   `HealthComponent.hit_sfx_id`/`death_sfx_id` hook (one change covers player/enemy/boss).
3. ~~Wire `EventBus.save_triggered`~~ — **DONE**: real `SavePoint.tscn`/`.gd`, placed in
   `save`-archetype rooms (which also fixed a separate bug: the assembler was silently ignoring
   the world graph's real per-room archetype and recomputing a simpler, inconsistent one),
   autosave after ability pickup and boss defeat, and the save/load round-trip now actually
   resumes at the checkpoint room (previously always restarted at `room_000` regardless of what
   was saved).
4. ~~Resolve the `GenerationRouter` duplication~~ — **DONE**: see §8. Image generation was also
   moved off its direct-provider-call bypass onto a new `ImageProviderRegistry`.
5. **Build a pause menu** (input action already exists) — small, self-contained, closes a
   player-facing gap that will be immediately obvious to anyone actually playing a generated game.
6. **Reconcile `GENERATION_PHASES` vs. actually-reported phases** — do this before adding any new
   pipeline phase, so new phases don't add to the same drift.
7. **Implement NPCs** (schema and profile budgets already exist) — natural next content-generation
   target now that quests/items exist as data; NPCs are the missing link that would make quests
   worth wiring into gameplay too.
8. **Wire quests/items into actual runtime systems** (do this after NPCs, since quest-givers are
   typically NPCs) — otherwise the generated `quests.json`/`items.json` remain decorative.
9. **Only after 1–8**: pursue the P2/P3 breadth items (ranged combat, enemy behavior variety,
   animation variety, image conditioning, etc.) — all of them build on a runtime that, as of this
   inspection, has not yet been confirmed to actually boot in Godot.

---

## 36. Final Handoff Summary

### Current Completion Estimate

These are deliberately conservative, based only on what was directly verified or read this
session — not aspirational.

| Area | Estimate | Basis |
|---|---|---|
| Core application (CLI + desktop + IPC + DB) | **75%** | Every screen/command real and working; gaps are settings persistence, job cancellation/pause, and the artifacts/validation DB tables |
| AI infrastructure | **50%** | Text-provider routing is genuinely solid; image/audio bypass routing entirely; a fully-built second router (`GenerationRouter`) sits unused; embeddings/reranking/vision-provider interfaces are unimplemented shells |
| Game generation (content/schema/pipeline) | **55%** | Game DNA/world/progression/content all real and now correctly gated; NPCs entirely missing; quests/items generated but inert |
| Procedural generation | **70%** | World/audio/music genuinely strong and bug-fixed this session; sprite/animation variety is thin (walk-cycle only) |
| Asset generation | **55%** | Real procedural fallback always works; AI paths real but unverified live; no conditioning (ControlNet/LoRA/img2img); no background removal |
| Godot runtime (the template itself) | **45%** | Player/combat/enemy/boss/transitions/save-mechanism/HUD all real code, but SFX playback is broken, save is unreachable, no pause menu/inventory/dialogue/NPCs/map/VFX |
| Godot assembly/export | **65%** | Real, verified project generation and static validation; "export" as a distinct concept doesn't exist; Godot-import correctness is entirely unverified (no binary available) |
| QA/validation | **70%** | 9 real static gates + real repair engine, all live-verified including failure/repair cycles this session; the one dynamic check (headless import) has never actually run |
| UI (desktop) | **80%** | Genuinely complete for its current scope, no mock data, real backend wiring throughout; just doesn't cover job cancellation/settings mutation because those don't exist yet either |
| **Overall vertical slice** (prompt → generated project → provably-correct progression graph → passes static QA) | **~60%**, with the caveat that **the single largest unverified assumption is "does the generated project actually run in Godot,"** which this inspection could not test |

### Biggest Current Blocker

**No Godot binary available to close the loop between "we generate syntactically plausible Godot
files" and "we generate a game that actually runs."** Every other finding in this document is
either already fixed (this session's bug fixes), a scoped and well-understood gap (NPCs, quests-
not-wired, audio-not-playing), or downstream of this one unknown.

### Next Critical Milestone

Run the existing `metroforge validate <slug>` command (already implemented, already wired to
Godot headless detection) against a real Godot 4.3 install, against one of the already-generated
projects in `GeneratedGames/`. This requires no code changes — only environment setup — and would
immediately convert the biggest block of `UNKNOWN`s in §33 into concrete pass/fail results.

### Top 10 Missing Implementations
1. ~~SFX/music playback wiring in `AudioManager.gd`~~ — **FIXED (later session)**
2. NPC generator + runtime scene/script (schema exists, nothing else does)
3. Quest/item runtime integration (generated as inert JSON today)
4. Pause menu (input action defined, nothing built)
5. Settings mutation (screen is read-only; no settings table is ever written)
6. `export_manifest.json` / distinct export step (spec concept, zero implementation)
7. Dialogue system
8. Inventory UI / item pickup objects
9. Map/minimap system
10. VFX generation and any VFX runtime hookup

### Top 10 Broken/Incomplete Implementations
1. ~~`AudioManager.gd` — three stub methods, SFX never plays~~ — **FIXED (later session)**, see §5/§20
2. `save_triggered` — never emitted anywhere; the save system is unreachable in normal play
3. ~~`GenerationRouter` — fully implemented, zero call sites, dead weight~~ — **FIXED (later session)**
4. `artifacts`/`validation_results`/`settings` DB tables — schema exists, never written
5. `GENERATION_PHASES` vs. actually-reported phases — 24 of 38 declared phases never leave PENDING
6. Enemy/boss behavior variety — rich stat data generated, one hardcoded behavior consumes it
7. ~~`metroforge generate <slug>`'s prompt-recovery — reads a `project.json` that's never written~~ — **FIXED (later session)**
8. Ranged combat — declared in `GameDNA`, never implemented regardless of the flag's value
9. Animation variety — only walk-cycle exists; idle/jump/attack/hurt/death are checked-for in
   GDScript but never generated
10. HuggingFace/Diffusers download adapters' unescaped shell interpolation (latent, not yet
    exploitable, but a real code-quality/security debt)

### Systems That Should NOT Be Rewritten
- **`packages/procedural/src/world.ts`** — now that this session's two real bugs are fixed and
  covered by tests that specifically prove the fixes are load-bearing (not vacuous), this is
  solid, well-evidenced code. Extend it, don't replace it.
- **`packages/qa/src/validator.ts`** (`QAValidator`/`RepairEngineer`) — real, tested, live-verified
  gate/repair pattern that's easy to extend (each gate/repair case is a small, isolated block).
- **`packages/database/src/sqlite.ts`**'s dual-backend switching logic — a genuinely clever,
  correct solution to "native sqlite doesn't reliably load inside Electron"; don't replace with a
  single-backend approach without understanding why this exists.
- **`packages/assets/src/pixel-art-processor.ts`** — verified idempotent this session with real
  algorithmic tracing, not just testing; this is trustworthy, deliberate code.
- **The Electron IPC boundary** (`preload.ts`/`handlers.ts`) — correct security posture, clean
  10-method surface, easy to extend by adding a new handle/expose pair. Don't introduce `remote`
  or loosen `contextIsolation` to solve future problems.
- **`packages/ai/src/registry.ts`**'s `CapabilityRouter`/`FallbackManager` — this is the routing
  system that's actually proven itself in live use. If `GenerationRouter` is chosen as the
  long-term direction (§35 step 4), migrate call sites to it deliberately rather than maintaining
  both — but don't discard the working one first.
