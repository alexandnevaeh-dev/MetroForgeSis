# MetroForge Current State Audit — 2026-08-19

Audit scope: implementation in `E:\Projects\MetroForge\Forged`, with the sibling `Forged-cursor-desktop` tree checked for divergence. Source code and generated artifacts were preferred over claims in phase documents. No implementation changes were made. The only repository change is this report.

## 1. Executive Summary

MetroForge is a substantial TypeScript monorepo prototype with a real CLI, Electron/React desktop studio, SQLite persistence, AI provider adapters, procedural game/content generation, asset processing, a Godot 4 template assembler, and an expanding QA/visual-quality layer. It is beyond foundation-only work.

The working path is:

`concept -> Game DNA (AI or deterministic fallback) -> design bible -> procedural world/progression/content -> procedural or local image assets -> procedural audio -> Godot template assembly -> static QA -> optional Godot headless QA -> repair -> report`.

That path is implemented, but the output is currently a functional prototype rather than a modern commercial Metroidvania. The strongest evidence is the implementation itself: `packages/procedural/src/world.ts` creates a room-index spine with limited branches, `packages/procedural/src/content.ts` uses small fixed name/stat tables, `packages/assets/src/png.ts` creates simple geometric fallback sprites, and `packages/generation/src/pipeline.ts` records structural passes even when visual or Godot validation is skipped. Generated projects exist in `Exports`, but current execution is not reproducible in this checkout because the dependency installation is broken/incomplete.

The shortest route to quality is not more providers or screens. It is a deterministic, validated vertical slice: one generated biome, authored composition rules, coherent asset identity, reliable Godot runtime start, and an automated gameplay/presentation acceptance gate.

## 2. Current Version / Milestone

| Item | Current state | Evidence |
|---|---|---|
| Product version | `0.1.0` | `packages/shared/src/constants.ts`, `packages/core/src/product.ts`, package manifests |
| Generator version | Defined in shared product constants; `0.1.0` product line | `packages/shared/src/constants.ts` |
| Git checkout | `Forged` is the canonical Git checkout; branch `feature/claude-generation-runtime`, ahead 6, dirty | Git status/log on 2026-08-19 |
| Last commit | `aae921d` dated 2026-08-17, vertical terrain variant fix | Git log |
| Sibling tree | `Forged-cursor-desktop` has no Git metadata and is behind/divergent from `Forged` | filesystem/Git inspection |
| Historical phase | Documentation names multiple phase/build states; implementation does not expose one authoritative current milestone | `docs/*STATUS*`, `docs/METROFORGE_CURRENT_BUILD*` versus source |
| Last clearly completed milestone | A generated Godot prototype path with exported artifacts, static QA, and visual/playtest infrastructure present; not a production-quality milestone | `packages/generation/src/pipeline.ts`, `packages/qa/src/*`, `Exports/` |
| Recommended current milestone | Coherent playable vertical slice, defined in section 32 | this audit |

**Languages:** TypeScript/TSX, GDScript, JavaScript/MJS, JSON, SQL, CSS, Markdown, shell/PowerShell. **Frameworks/runtimes:** Node.js `>=22.5.0`, TypeScript 5.7, React 18, Vite 6, Electron 33, Vitest 2, Godot 4 template runtime, SQLite via native/sql.js paths, Ollama/HTTP provider APIs. **Package manager:** pnpm `>=9`. **Backend:** local Node services/packages and Electron main-process IPC; no separate hosted backend. **Database:** SQLite with migrations and a sql.js fallback. **Queues:** database-backed generation jobs/stages, in-process orchestration; no external queue. **Storage:** generated project directories, `.metroforge`, JSON manifests/reports, local model directories. **Targets:** Godot 4 2D Metroidvania projects; Windows desktop is the practical desktop target; other Godot export platforms are not established.

## 3. Architecture

| Subsystem | Responsibility | Status |
|---|---|---|
| `apps/cli` | `doctor`, create, generate, validate, providers, models/scout commands | FUNCTIONAL BUT INCOMPLETE |
| `apps/desktop` | Electron shell, preload IPC, React studio screens | FUNCTIONAL BUT INCOMPLETE |
| `packages/shared` | constants, config, paths, logging, profiles, cancellation, tuning | FUNCTIONAL |
| `packages/schemas` | Zod contracts for projects, jobs, DNA, graphs, content, models, validation | FUNCTIONAL |
| `packages/core` | product identity/version | COMPLETE for its scope |
| `packages/database` | SQLite schema/migrations, project/job repositories, settings | FUNCTIONAL BUT INCOMPLETE |
| `packages/ai` | providers, catalog, health, routing, model scouting/benchmarking, licenses, speech adapters | FUNCTIONAL BUT INCOMPLETE |
| `packages/procedural` | seeded world, progression, content, bibles, WAV/MIDI/music | FUNCTIONAL BUT INCOMPLETE |
| `packages/assets` | image providers, procedural PNGs, pixel processing, tiles/foundry/provenance/critics | FUNCTIONAL BUT INCOMPLETE |
| `packages/generation` | end-to-end orchestration and checkpoints | FUNCTIONAL BUT INCOMPLETE |
| `packages/godot` | scenes/scripts/assets/resources assembly from template | FUNCTIONAL BUT INCOMPLETE |
| `packages/qa` | structural, Godot, gameplay capture, visual, presentation, repair gates | PARTIAL to FUNCTIONAL BUT INCOMPLETE |
| `packages/tools` | Godot/Ollama/Python/FFmpeg/Git detection and launch/export helpers | FUNCTIONAL BUT INCOMPLETE |
| `templates/godot-metroidvania` | reusable Godot runtime, scenes, scripts, HUD, save/progression/audio systems | FUNCTIONAL PROTOTYPE |

## 4. Repository Tree

```text
Forged/
  apps/
    cli/src/commands/       CLI entrypoints and commands
    desktop/electron/       Electron main/preload/IPC
    desktop/src/studio/     React studio, editors, browsers, QA, preview
  packages/
    ai/                     providers, routing, catalog, benchmarks, licenses, speech
    assets/                 image pipeline, pixel processing, tile compiler, asset foundry
    core/                   product metadata
    database/               SQLite/sql.js, migrations, repositories
    generation/             end-to-end generation pipeline
    godot/                  project/room/template assembly and composition
    procedural/             seeded world/content/bibles/audio generation
    qa/                     validation, repair, screenshots, playtest/presentation gates
    schemas/                Zod contracts
    shared/                 configuration, paths, logging, profiles, tuning
    tools/                  tool detection, Godot launch/export, lifecycle
  templates/godot-metroidvania/
    project.godot
    scenes/                 boot, player, enemies, bosses, world, test
    scripts/                player, AI, combat, core, UI, world, test
    data/rooms/rooms.json
  config/                   model and provider catalogs
  models/{image,llm}/       local model locations
  Exports/                  generated Godot projects and reports
  GeneratedGames/           generated-game output area
  docs/                     architecture, build status, audits, decisions
  scripts/                  capture/contact-sheet and operational scripts
  reports/                  visual slices and audit artifacts
```

`Forged-cursor-desktop/` is a second source tree with similar packages but fewer current modules. It should be treated as an abandoned/parallel implementation until provenance is resolved; it is not the canonical branch.

## 5. Feature Status Matrix

| Area | Classification | Evidence / limitation |
|---|---|---|
| Monorepo/package structure | FUNCTIONAL | 13 workspace projects and package manifests |
| CLI | FUNCTIONAL BUT INCOMPLETE | `apps/cli/src/index.ts`, command modules; current dependencies cannot run |
| Desktop shell | FUNCTIONAL BUT INCOMPLETE | Electron main/preload and React `App.tsx`; no packaged installer |
| Schemas | COMPLETE for current contracts | Zod schemas and tests |
| Project/job persistence | FUNCTIONAL BUT INCOMPLETE | SQLite migrations/repositories; no robust crash recovery/resume scheduler |
| Text AI providers | FUNCTIONAL BUT INCOMPLETE | Ollama, Gemini, Groq, OpenRouter, Hugging Face, NVIDIA adapters |
| Image generation | PARTIAL | ComfyUI/Diffusers adapters plus procedural fallback; no full coherent asset suite |
| Audio generation | PARTIAL | procedural SFX, tracker/MIDI/Furnace, optional Stable Audio; no complete runtime mix pipeline |
| World generation | FUNCTIONAL BUT INCOMPLETE | seeded graph and reachability checks; limited topology/composition |
| Godot assembly | FUNCTIONAL BUT INCOMPLETE | template copier/generator and scene/resource writing |
| QA | PARTIAL | many gates exist; execution and gameplay-quality proof are incomplete |
| Commercial-quality generation | NOT IMPLEMENTED | no evidence of repeatable polished output |
| Windows distribution | SCAFFOLDED | Electron build scripts; no installer/signing/update/crash pipeline |

## 6. Game Generation Pipeline

`packages/generation/src/pipeline.ts` is the controlling path. It creates output and `.metroforge`, opens the database, obtains Game DNA through `GenerationRouter` or a deterministic fallback/checkpoint, writes `game_dna.json`, builds a design bible, creates a project/job, generates world and progression graphs, generates enemies/bosses/quests/items, synthesizes audio, runs the asset pipeline, assembles Godot, runs QA/optional Godot checks/repair, writes `validation_report.json`, and closes the database.

**Game design:** concept intake, genre/identity, technical constraints, tone/style, movement/combat flags, abilities, room/biome counts, premise/protagonist/conflict, art bible and audio bible exist in `GameDNASchema` and `bibles.ts`. Detailed progression balancing, systemic combat tuning, economy balancing, and production GDD/design-bible authoring are mostly absent or deterministic templates. Narrative is limited to premise/protagonist/antagonist/conflict and generated placeholder-like quest/lore strings in `content.ts`; characters, factions, NPC schedules, dialogue graphs, localization, and environmental story content are not implemented as a generation system.

**World:** room graph, biomes/regions, critical path, ability-tagged rooms, optional shortcuts, bidirectional edges, and connectivity/reachability checks exist. Room composition, authored room layouts, secrets, meaningful rewards, lock/key variety, sequence-break policy, backtracking loops, and room-specific encounter design are partial. The topology is primarily indexed rooms connected by a spine, not a commercial metroidvania map generator.

## 7. AI Providers

Implemented provider classes include Ollama, Gemini, Groq, OpenRouter, Hugging Face, NVIDIA, Ollama embeddings, Piper TTS, and Whisper ASR. Provider health, model listing, fallback, catalog reconciliation, license metadata, and mode routing exist in `packages/ai/src/`.

The real generation path uses the canonical text router for Game DNA. Image generation is still package-local in `packages/assets`, and audio mostly uses procedural/native paths. The plugin interface in `provider-plugin.ts` is an extension contract, not proof that every modality is connected to the generation pipeline.

## 8. NVIDIA Integration

**Implemented:** `NvidiaProvider` uses the OpenAI-compatible NIM endpoint, bearer authentication, `/models` discovery, default model selection, JSON mode, bounded retries/backoff for transient statuses, retry-after handling, error classification, health details, latency, and key redaction. NVIDIA image and vision-critic adapters also exist under `packages/assets/src/providers` and asset-foundry NVIDIA modules.

**Configured identifiers:** `meta/llama-3.2-11b-vision-instruct`, `meta/llama-3.1-8b-instruct`, `nvidia/llama-3.1-nemotron-70b-instruct`, `deepseek-ai/deepseek-v4-flash-0731`, and `deepseek-ai/deepseek-coder-6.7b-instruct`. All are `enabled: false` in `config/models.catalog.json`; the provider is `enabled: false` in `config/providers.default.json`. The provider constructor default is `meta/llama-3.1-8b-instruct`.

**Capability result:** LLM/text/JSON and some coding/narrative routing are implemented at adapter/catalog level. Vision/image analysis is implemented by a separate asset adapter, not by the canonical text `GenerationRouter`. Image generation, embeddings, reranking, STT, TTS, translation, 3D generation, safety, Audio2Face, ACE, CUDA/TensorRT/Triton integration are not implemented as NVIDIA capabilities in the pipeline. No evidence shows NVIDIA local NIM deployment, CUDA orchestration, Triton serving, cost accounting, or commercial-production entitlement enforcement beyond metadata/filtering.

## 9. Capability Router

Capability routing is genuine for text providers: `CapabilityRouter` filters enabled providers by capability/local/free constraints and priority; `FallbackManager` tries up to three candidates. `GenerationRouter` maps richer model capabilities into text buckets. Model ranking adds priority, specialization, benchmark score, installed/health/speed/commercial factors and hardware constraints.

Supported declared modes are `FREE_ONLY`, `LOCAL_ONLY`, `HYBRID_FREE`, and `CUSTOM`; the implementation also uses `balanced`, `quality`, and `fast` as quality targets. There is no first-class `highest quality`, `fastest`, `offline`, `low-VRAM`, or `NVIDIA-only` mode schema, though local/free/hardware filters cover parts of those concepts. Fallback does not report which attempt won (`fallbackUsed` is explicitly left false). Latency/health exists; durable quality feedback, cost tracking, context-window filtering in live provider selection, and automatic router updates from benchmarks are incomplete. Image routing is a separate registry and audio is not governed by one canonical multimodal router.

## 10. Model Benchmarking

`ModelBenchmarkService` exists with Ollama live probing for one JSON prompt and heuristic scoring for everything else. It reports JSON compliance, approximate latency, code/reasoning scores, and `measured`. Tests exist.

This is experimental, not production-ready: no task datasets for story/dialogue/world/GDScript/sprite/tile/VFX/music/visual QA, no robust judges or VLM evaluation suite, no deterministic multi-case regression corpus, no durable leaderboard, and no automatic router update. Hosted providers and unavailable Ollama models receive metadata-derived scores rather than measurements.

## 11. Asset Pipeline

Asset generation includes concept/image provider interfaces, ComfyUI/Diffusers/local paths, procedural PNG generation, pixel-art processing, tile compiler/variants, asset-foundry compilers and manifests, provenance/license modules, VLM/deterministic critics, and generated asset metadata. The pipeline currently guarantees a fallback more reliably than it guarantees a high-quality asset.

Implemented or partial: player/enemy/boss/item/tile/background-like textures, sprite sheets, tile sources, icons and VFX texture interfaces, audio/SFX assets, HUD/runtime template assets. Missing or weak: complete NPC/weapon/equipment/portrait/cutscene/loading/promotional asset families, production typography, authored animation sets, coherent biome-specific tilesets, and reliable engine-ready imported resources for every family. Generated PNGs are transformed into files and referenced by Godot; that is engine integration, but not proof of visual readiness.

## 12. Animation Pipeline

There is procedural walk, hurt-flash, and attack sheet creation plus pixel processing and `AnimatedAssetSprite.gd`. Godot scenes/scripts include animation/runtime support. However, there is no robust general sprite slicing/extraction contract, pivot/anchor metadata, animation-state authoring for every actor, transition graph, boss/weapon/VFX timing pipeline, or automated frame continuity/readability check. The generated sheets can be consumed by the template in narrow cases, but direct reliable use for a full commercial animation set is NOT IMPLEMENTED.

## 13. Audio Pipeline

`packages/procedural/src/audio.ts` synthesizes deterministic WAV SFX including jump, dash, hit, pickup, UI, death, ability, and boss hit. `music.ts` creates seeded loops, MIDI, tracker patterns, and Furnace/OpenMPT-oriented JSON. The pipeline optionally enhances music through Stable Audio.

Biome themes and SFX guidelines exist in `AudioBible`; runtime `AudioManager.gd` exists in the template. Adaptive music, boss/combat state transitions, ducking/mixer buses, ambient/footstep systems, voice/dialogue, localization, loudness normalization/mastering, and complete Godot import verification are incomplete. Audio is functional fallback content, not a polished soundtrack pipeline.

## 14. World Generation

`generateWorldTopology` creates seeded room IDs, archetypes, regions, a main spine, limited optional shortcuts, vertical transitions, ability-grant metadata, and ability requirements. `validateWorldConnectivity`, `validateWorldReachability`, and progression validation are real and valuable.

The current graph does not demonstrate rich room graphs, authored critical-path pacing, meaningful optional loops, lock/key grammar, sequence-break validation, shortcut placement quality, secret discovery, landmarking, or exploration reward density. It is structurally metroidvania-shaped, not yet a modern commercial metroidvania world.

## 15. Gameplay Generation

Schemas cover abilities, enemies, bosses, quests, items, boss phases, health/combat components, save points, gates, transitions, and player movement. The Godot template contains player, enemy, boss, combat, progression, save, UI, and world scripts.

Generated content is mostly data-driven, but `content.ts` uses fixed small tables and generic descriptions. Inventory/equipment, robust item effects, NPC/dialogue/quest runtime, multiple ability implementations, enemy AI variety, boss phase behavior, camera feel, accessibility/settings, and difficulty balancing are incomplete. Generated GDScript is not a major live pipeline; most runtime code is copied from a template, so “AI-generated gameplay code” is largely scaffolded rather than generated per game.

## 16. Godot Export

The assembler produces/copies `project.godot`, boot/world/player/enemy/boss/world scenes, scripts, room scenes, assets, audio, graphs, manifests, input requirements, and resources from `templates/godot-metroidvania`. The template includes autoload-like managers, input actions, collision/runtime systems, save points, HUD, shaders/asset sprite support, and a `RuntimeSmokeTest` scene/script.

Blocking limitations: Godot executable detection is optional, so headless validation is skipped when absent; resource reference validation is primarily textual; imports/navigation/animation/audio behavior are not fully compiled/proven; generated rooms are assembled from generic platform/floor patterns; Godot project packaging/export presets, platform builds, import cache handling, and a guaranteed Play-button acceptance run are not established. Therefore “open in Godot 4 and press Play without manual repair” is UNKNOWN, with structural prototype evidence but no current runnable proof.

## 17. QA / Automated Playtesting

QA has required-file, DNA, connectivity, progression, room, resource-reference, input, player, main-scene, Godot-import, runtime, screenshot, gameplay-capture, presentation, visual-quality, repair, and acceptance-report modules. There are 9 QA test files in the canonical checkout.

Automated gameplay evidence is limited: capture/playtest infrastructure can launch or inspect a project and produce output, but there is no demonstrated agent that robustly navigates movement, jumping, combat, abilities, boss fights, save/load, victory, or recovery across arbitrary generated maps. Most gates verify files/scripts/launch/screenshots, not whether the game is fun, readable, balanced, or completable.

## 18. Visual Quality

Visual direction has an `ArtBible`, palette, prompt prefixes, negative prompts, lighting/parallax/UI guidance, pixel processor, deterministic PNG checks, VLM critic, scene critic, visual gates, quality scoring, and repair modules. These are meaningful foundations.

They do not currently enforce full palette/scale/proportion/alignment/tile/animation/biome/lighting/silhouette/readability/foreground separation coherence. The deterministic fallback primitives in `packages/assets/src/png.ts` explain why outputs can look garbled, flat, inconsistent, or prototype-like when image providers are absent or unavailable. A VLM critic can reject malformed buffers but cannot establish commercial art direction by itself.

## 19. Visual Inspection

| Inspector | State |
|---|---|
| Project/dashboard/preview | IMPLEMENTED, bridge-dependent |
| Asset gallery/browser | IMPLEMENTED/PARTIAL |
| Characters/enemies/bosses/items/icons | PARTIAL through generic asset gallery |
| Sprite sheets/individual frames/animation playback | PARTIAL; no complete frame inspector proof |
| Tilesets/tile paint/rooms/world map | IMPLEMENTED/PARTIAL (`TilePaintEditor`, `RoomEditor`, `WorldEditor`, `WorldMapPreview`) |
| Backgrounds/VFX/UI | PARTIAL generic previews |
| 3D assets/materials | MISSING as a first-class workflow |
| World/room maps | IMPLEMENTED/PARTIAL |

The desktop has many screens (`AssetsGallery`, `WorldEditor`, `RoomEditor`, `DungeonEditor`, `QAScreen`, `PreviewScreen`, `ModelsScreen`, `ProvidersScreen`, `ExportScreen`, `SettingsScreen`), but existence of a screen does not establish deep editing or reliable backend behavior.

## 20. Editing System

The desktop exposes project selection, create/generate flows, world/room/dungeon/tile editors, asset generation, settings and previews. Some API/context types include editing status and project memory.

There is no demonstrated unified non-destructive document model covering concept/GDD/story/world/code/shaders/AI/assets/audio/settings with dependency-aware partial regeneration. Version history, undo/redo, diffs, asset-level provenance links, dependency graph invalidation, and post-edit regeneration/validation are incomplete or missing. Current persistence is primarily project/job records and files, not a full authoring system.

## 21. Desktop UI

Framework is Electron 33 + React 18 + Vite 6 with a context-isolated preload IPC bridge. Navigation and screens are real, not just a blank shell. The UI includes dashboard, generation studio, project browser, assets, world/room/dungeon editors, preview, QA, providers/models/routing, export, settings, logs/status and generation queue components.

It is a credible prototype studio surface, but provider/process availability is visible as warnings and the IPC/backend contract is still thin. A production game-development application would need deeper document editing, reliable previews, asset provenance, robust job cancellation/resume, richer visual inspection, and packaged Windows distribution. Current styling appears intentionally studio-like in `styles.css`, but production polish cannot be certified without launching it.

## 22. Windows Packaging

Electron dev/build scripts and Windows-aware subprocess/path handling exist. `ToolRegistry` detects Godot, Ollama, Python, FFmpeg and Git. There is no verified installer, app icon pipeline beyond template assets, code signing, auto-update, crash reporting, robust portable-data/external-drive policy, or release artifact. A usable developer build is scaffolded; a usable distributable Windows product is NOT IMPLEMENTED.

## 23. Tests

The canonical source contains 47 generated export `project.godot` and validation-report artifacts, and 9 QA test files. The wider repository has focused tests for schemas, AI routing/providers/catalog/benchmarks/downloads/licenses/speech, assets, procedural world/content/audio/music/bibles, Godot assembly, and QA.

Current execution result on 2026-08-19:

* `pnpm test`: FAILS at startup because `vite` cannot be resolved from the installed `vitest` dependency.
* `pnpm typecheck`: FAILS because the workspace resolves a missing/broken `tsc` executable.
* No reliable current pass/fail/skipped/flaky counts can be reported because the suite never reaches test collection.
* Godot runtime tests were not executable from the repository because Godot was not detected/proven in this session.

The test code is stronger than the current environment, but passing historical or generated reports must not be treated as a current green build.

## 24. Bugs

High-confidence issues found by inspection:

1. Dependency/runtime reproducibility is broken in both trees: missing `node_modules` in the sibling and incomplete dependency graph in the canonical checkout.
2. `GenerationRouter` returns `fallbackUsed: false` even when fallback may have occurred, explicitly acknowledged in `packages/ai/src/generation-router.ts`.
3. Catalog/provider enablement is split between static defaults and live key-gated bootstrap; disabled catalog entries can mislead model ranking/UI.
4. Godot QA is optional and generation can complete with a warning when Godot is absent.
5. Asset success can mean a deterministic PNG passed size/header checks, not that the visual asset is coherent.
6. Job persistence records stages but the pipeline has limited cancellation, resumability, and crash recovery semantics.

## 25. Technical Debt

**P0/P1:** duplicate `Forged-cursor-desktop` source tree; incomplete dependency lock/install reproducibility; optional Godot validation; structural QA reported as successful generation; primitive procedural fallback assets; generic linear topology; no guaranteed playability/completion test.

**P1/P2:** parallel text/image routing implementations; catalog metadata versus live provider registry drift; benchmark heuristics; incomplete fallback attribution; broad schemas with shallow runtime implementations; generated outputs and reports mixed with source checkout; limited job cancellation/resume.

**P2/P3:** unfinished multimodal plugin interfaces, unused/experimental provider adapters, phase/audit document accumulation, duplicated historical reports, and broad model catalog entries whose runtime adapters do not exist.

Debt markers were searched across source/docs excluding dependencies and generated outputs. The important recurring themes are `not yet`, placeholder/scaffold language, and modality interfaces without end-to-end callers; exact marker counts are not reliable because the canonical tree contains generated/built copies and the two trees diverge.

## 26. Security

Positive controls: NVIDIA key masking/redaction, environment-based provider keys, Electron context isolation/node integration disabled, Zod validation, and explicit model-download approval intent.

Risks:

* `execSync`/`spawn` invoke Godot, Ollama, Python, FFmpeg, Git, `ollama pull`, and `huggingface-cli`; quoting and user-configured paths need a strict allowlist and argument-array policy.
* Hugging Face download commands interpolate model/repository/path values into shell command strings, creating command-injection risk if catalog/user metadata is untrusted.
* Generated projects/scripts are written to disk and may be run by Godot; there is no strong sandbox for generated code or hostile prompts/assets.
* API keys and provider errors must remain out of logs; NVIDIA has redaction, but this should be audited across every provider.
* Archive extraction/path traversal protections were not established in the inspected path.
* Generated prompt/content paths and output slugs require continued traversal/symlink hardening, especially on external drives.

## 27. Performance

Likely bottlenecks are large local diffusion model downloads/inference, synchronous child processes, image processing in Node memory, sequential provider fallback, VLM calls with 60-second timeouts, whole-project file writes, and Godot import/export. SQLite access is modest but stage updates are synchronous. There is some provider/model caching and virtualized desktop lists, but no measured end-to-end generation budget, bounded concurrency policy, asset memory budget, or profiling data.

## 28. P0 Gaps

| Problem / evidence | Impact | Modules | Recommended fix / dependencies |
|---|---|---|---|
| Current install cannot run tests/typecheck | No trustworthy build baseline | root manifests/lockfiles | Repair lockfile/install contract, clean install CI; dependency graph first |
| Godot Play-button result is unproven and optional | Generated game may require manual repair | `generation`, `godot`, `qa`, `tools` | Make Godot runtime smoke test a required acceptance gate; Godot install/CI dependency |
| Structural QA can pass with primitive assets | “Successful” output may be visually unusable | `assets`, `qa`, `generation` | Add asset maturity gates and fail/warn policy based on actual provider/fallback/provenance |
| No arbitrary-game completion bot | Cannot prove traversal, combat, progression, victory | `qa`, template runtime | Implement deterministic gameplay agent and bounded generated-game scenarios |
| Duplicate source trees | Future changes can land in wrong implementation | repository layout | Select/archive one tree and document canonical root; coordination decision required |

## 29. P1 Gaps

| Problem / evidence | Impact | Modules | Recommended fix / dependencies |
|---|---|---|---|
| Linear room-spine topology and generic content | Output does not behave like a modern metroidvania | `procedural`, `godot` | Build authored room archetype/composition grammar and multi-loop progression |
| Primitive procedural fallback sprites | Garbled/flat prototype visuals | `assets`, `templates` | Create a coherent one-biome asset pack with fixed scale/palette/anchors and engine import validation |
| Shallow narrative/quests/dialogue | Worlds lack authored identity | `ai`, `procedural`, `schemas`, template | Add structured narrative graph and runtime dialogue/quest data |
| Missing game-feel quality gates | Technically playable games feel amateurish | `templates`, `qa` | Measure movement, coyote/buffer, hit pause/flash, knockback, camera, telegraphs, boss readability |
| Audio is fallback-oriented | No adaptive/combat/boss presentation | `procedural`, template audio | Add bus/mix state model and runtime integration before expanding model providers |

## 30. P2 Gaps

* Unified multimodal capability router with real mode semantics, fallback attribution, cost/context/license filters, and benchmark feedback.
* Full asset-foundry contract for animation, tileset, provenance, engine import, and regeneration.
* Non-destructive editing, diffs, undo/redo, revision history, dependency tracking, and partial regeneration.
* Durable queue cancellation, retries, resumability, crash recovery, and dependency graph execution.
* Complete Windows packaging, signing, updates, crash reporting, and portable storage policy.
* Broader provider integration for audio, speech, image editing, embeddings, and hosted vision.

## 31. P3 Opportunities

* 3D asset/material inspection and future 3D generation.
* ACE/Audio2Face/CUDA/TensorRT/Triton integrations.
* VLM-judged model tournaments and persistent leaderboards.
* Localization/voice production, promotional asset generation, and cutscene tooling.
* Advanced sequence-break simulation, procedural secrets, landmarking, and adaptive pacing.

## 32. Recommended Next Milestone

### Coherent Playable Vertical Slice

**Objective:** Generate one small, visually coherent, deterministic Metroidvania slice from a concept, open it in Godot 4, press Play, traverse two or three rooms, acquire one ability, defeat one enemy/boss encounter, save, reload, and reach a verified victory condition.

**Why next:** It attacks the current P0/P1 blockers simultaneously and creates a truthful quality baseline. More AI models, editors, or catalog entries do not solve the absence of a proven coherent output.

**Systems affected:** `packages/generation`, `procedural`, `assets`, `godot`, `qa`, `templates/godot-metroidvania`, `tools`, minimal desktop preview/status integration.

**Dependencies:** clean pnpm install/typecheck/test; a pinned Godot 4 executable in CI or documented local setup; one fixed art/audio provider path plus deterministic fallback; existing schemas/database.

**Deliverables:** authored slice grammar, one biome palette/tileset/character/enemy/boss set, anchor-aware animation sheets, runtime ability/gate/save/transition behavior, required Godot smoke/playtest gate, asset coherence report, completion screenshot/video/report, reproducible fixture seed.

## 33. Proposed Acceptance Criteria

1. Clean checkout installs with pnpm and runs all unit tests/typechecks.
2. One fixed seed generates the same graph, manifests, and deterministic fallback artifacts.
3. Generated project contains valid `project.godot`, scenes, scripts, resources, input actions, and resolved references.
4. Godot headless import passes and the runtime smoke test launches without errors.
5. Automated agent completes movement, jump, combat, ability pickup, gate reopening, save/load, boss encounter, and victory.
6. Asset gate verifies dimensions, alpha, anchors, palette, tile compatibility, animation frames, and missing imports.
7. Presentation gate verifies readable silhouettes, contrast, camera framing, UI bounds, no missing textures, and stable screenshot composition.
8. QA fails generation when any required runtime/playability gate fails; warnings are not mislabeled as complete.
9. `validation_report.json` records provider/model/fallback provenance and accurate fallback attribution.
10. A human can open the generated directory in Godot 4 and press Play without manual repair.

## 34. Files Most Likely to Change Next

* `packages/generation/src/pipeline.ts`
* `packages/procedural/src/world.ts`
* `packages/procedural/src/content.ts`
* `packages/assets/src/asset-pipeline.ts`
* `packages/assets/src/foundry/*`
* `packages/godot/src/assembler.ts`
* `templates/godot-metroidvania/scenes/*`
* `templates/godot-metroidvania/scripts/*`
* `packages/qa/src/validator.ts`
* `packages/qa/src/quality-director.ts`
* root `package.json`, `pnpm-lock.yaml`, workspace configuration

### Repository Verdict

## FUNCTIONAL PROTOTYPE

MetroForge is more than scaffolding: it has a real end-to-end orchestration path, seeded graph/content generation, provider adapters, asset/audio fallbacks, a Godot assembler/template, SQLite jobs, a desktop studio, and extensive QA source. It is not Alpha in the product-quality sense because current execution is not reproducible, Godot Play-button success is not proven in this environment, output quality is dominated by generic/procedural fallback behavior, and automated playtesting does not yet establish completion or feel. The codebase is a functional generation prototype with a credible foundation for the proposed vertical slice milestone.