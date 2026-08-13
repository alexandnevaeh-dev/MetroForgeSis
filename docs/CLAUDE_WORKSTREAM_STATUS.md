# Claude Workstream Status

Backend/generation/runtime/QA workstream status, maintained by the Claude agent working `feature/claude-generation-runtime`. Companion to `docs/PARALLEL_CHANGELOG.md` (append-only log), `docs/CURSOR_WORKSTREAM_STATUS.md` and `docs/CURSOR_BACKEND_REQUIREMENTS.md` (the other agent's own status/asks).

Last updated: 2026-08-13.

## How this session started

Repo state at session start was far ahead of this session's own prior context: another agent had already implemented most of a large prior backlog (ability framework with 9 real modular abilities, playtest personas + telemetry, quests, dialogue, shops, inventory, minimap, movement-feasibility QA, atomic multi-slot saves, COMMERCIAL_SAFE mode routing, database persistence for artifacts/validation results) and was — verified live, mid-session, via files changing between successive `Read` calls — actively scaffolding a second game archetype (`TOP_DOWN_ACTION_ADVENTURE`) in the same working tree. That agent has since moved to a real isolated worktree (`../Forged-cursor-desktop`, branch `feature/cursor-desktop-studio`) and left a concrete backend-requirements handoff in `docs/CURSOR_BACKEND_REQUIREMENTS.md`, which this session implemented in full.

## Completed (this session, verified)

### Pass 1 — generation-mode routing + health-aware ranking
- Generation-mode expansion (`NVIDIA_ONLY`, `COMMERCIAL_SAFE`, `OFFLINE`, `FASTEST`, `HIGHEST_QUALITY`, `LOW_VRAM`, `BALANCED`) — `RoutingContext`/`ModelMetadata`/`AIProvider` extended, `CapabilityRouter` filters wired, `LicenseRouter` broadened to a reusable structural type (`LicenseSubject`). Converged with the other agent's independent `mode-routing.ts`/`catalog-reconciliation.ts` factoring — no lasting conflict.
- Health-aware candidate ranking in `CapabilityRouter.getCandidates()` (healthy > degraded > unavailable, priority as tiebreaker, nothing ever hard-excluded) — closes the one real gap an Explore-agent audit found in `ProviderHealthMonitor` (it existed and was used for dashboards, but nothing fed live provider health into routing decisions).
- Fixed a real, concurrent-edit-caused build/test break across `packages/procedural/src/topdown/world.ts` + its test file (stale `dungeonItem` reference after a param rename, missing `optional` field on 4 literal edges, test file's relative imports not updated after it moved into `src/topdown/`) — mechanical, not new functionality.

### Pass 2 — Cursor backend requirements (`docs/CURSOR_BACKEND_REQUIREMENTS.md`, all 7 items)
1. `generateGame` archetype — typed end-to-end (preload → handler → `GenerationPipeline.run()`, which already consumed it); previously worked by accident (untyped passthrough), now real.
2. `explainModelRouting(capability)` — new `packages/ai/src/model-catalog.ts` export, real per-model accept/reject trace (license via `LicenseRouter`, provider-enabled, RAM/VRAM fit), reusing `rankModelsForCapability`'s scoring rather than duplicating it.
3. `getOverworldMap(projectPath)` — reads `data/world/overworld.json` (written by `assembler.ts`'s `writeTopDownWorld()`), returns region/node/edge spatial payload.
4. `getDungeonGraph(projectPath, dungeonId?)` — real room-kind/keys/doors/criticalPath derivation from `overworld.json` POI data.
5. `getRoomCollision(projectPath, roomId)` — real per-area `collisionRects`.
6. `categorizeAssetPath` in `handlers.ts` realigned to the exact same taxonomy as the renderer's own copy (`apps/desktop/src/studio/types.ts`), so the two never disagree.
7. `modelId` threaded through `GeneratedAsset` → `ArtifactGeneratedEvent` → `db.artifacts.create()` → `AssetManifestEntry`/`generation_manifest.json` → `list-assets`. Only set where a real image-generation provider result exists — `undefined` for procedural/checkpoint assets, not fabricated.

All 3 new spatial/routing APIs were verified against a real `TOP_DOWN_ACTION_ADVENTURE` TINY_TEST generation's actual `overworld.json` output, not just typechecked.

## Verified already complete by the other agent (source-checked, not just doc claims)

An Explore-agent audit against actual source + tests (not `docs/CURSOR_HANDOFF_AUDIT.md`'s own claims) confirmed these are genuinely done, with file:line evidence:

- AbilityCatalog/AbilityController architecture, dash migrated, all 5 core movement abilities (double jump, wall slide, wall jump, air dash, ground slam) real and modular.
- Gate-to-ability validation (`registered_abilities_valid` QA gate) and `MovementFeasibilityValidator` (real jump/dash-reach math, wired as a static QA gate).
- GameDNA movement runtime sync (`data/player/movement.json` written at assembly time, read by `PlayerMovementConfig.gd`).
- Room archetype persistence (13 distinct archetypes assigned and preserved, `room_archetype_fidelity` QA gate).
- Atomic save (temp-file + rename), save migrations, real 3-slot multi-slot save/load.
- Dead-code cleanup: `AbilityGate.gd/.tscn`, `AssetSprite.gd` fully removed; `GodotProjectAssembler.validate()` doesn't exist (never re-added).
- Database persistence: `artifacts` and `validation_results` repositories are called from the real `GenerationPipeline`, not just unit-tested in isolation.

### Pass 3 — top-down Godot runtime: 0/0 (or crashing) → 13/13 smoke-test checks passing

Full root-cause diagnosis (not a template swap) — see `docs/PARALLEL_CHANGELOG.md`'s matching entry
for the complete list. Summary: fixed a progression-graph node-type bug that made the abstract
ability chain permanently unsolvable; scaled `generateTopDownWorld()` to real profile-scaled,
item-gated multi-dungeon generation; made the QA repair engine's template-restore logic
archetype-aware (it was silently reintroducing deleted side-view files into top-down projects);
fixed `room_archetype_fidelity`/`registered_abilities_valid`/`required_files`/
`required_scenes_exist` to actually understand the top-down archetype; deleted 10 dead side-view
leftover files plus one dead duplicate world-manager script; fixed 6 distinct real GDScript bugs
(wrong node name, illegal `const` expression, wrong return type assumption, missing `class_name`,
two `:=` type-inference failures) that only running the actual Godot binary surfaced; fixed a
PASS/FAIL output-format mismatch between the top-down smoke test and its TS parser that silently
discarded every result even on a fully passing run.

Verified live against real Godot 4.7.1: `godot_runtime` gate now 13/13 PASS.

## Partial — real, open gaps

- **`godot_playtest`: 2/8.** `templates/godot-topdown-adventure/scripts/test/PlaytestRunner.gd` is
  an unmodified copy of the side-view template's version (identical line count) — the automated
  persona-driven playtest-bot layer hasn't been adapted for top-down's input/victory model.
  Comparable in scope to all of Pass 3 above; explicitly out-of-scope in the original
  implementation spec ("sophisticated AI playtest bots — do not implement yet"). Not attempted.
- **Victory-path runtime assertion (side-view).** `RuntimeSmokeTest.gd`'s boss-victory check
  exercises a real signal chain but delivers damage via a direct `take_damage(max_health)` call,
  not simulated player attack input. No single test chains simulated-input combat all the way to
  `VICTORY`. Not touched this pass.
- A mini-boss concept doesn't exist in the top-down generator yet (`getDungeonGraph.miniBossId` is
  always `undefined`) — add one if the dungeon design calls for it.

## Next (recommended, not started by me)

1. Adapt `PlaytestRunner.gd`/`PlaytestAgent.gd` for top-down (persona-driven simulated input,
   dungeon-item progression instead of ability progression, victory detection via
   `EventBus.boss_defeated`) — the `godot_playtest` gap above.
2. Close the side-view victory-path gap: extend `PlaytestRunner.gd`'s input-simulated combat loop
   through to a `VICTORY` assertion, or add an equivalent check in `RuntimeSmokeTest.gd`.
3. A mini-boss concept doesn't exist in the top-down generator yet — add one if wanted.
4. `TOP_DOWN_PROFILE_DEFAULTS.townCount` places NPC/save clusters on the overworld but no
   distinct "town" scene/area concept exists — currently honest (no fake town), but a real one
   would need its own area kind.

## New contracts / APIs

- **New IPC handlers + preload bridges:** `explainModelRouting`, `getOverworldMap`, `getDungeonGraph`, `getRoomCollision` (see `docs/PARALLEL_CHANGELOG.md` for exact shapes).
- **`generateGame` / `generate-game` IPC:** `archetype?: string` now typed end-to-end.
- `RoutingContext` gained `nvidiaOnly?`, `offline?`, `commercialSafeOnly?`, `maxVramMb?` (additive).
- `ModelMetadata`/`AIProvider` gained `commercialUse?`, `estimatedSpeed?`, `estimatedQuality?`, `minVramMb?` (additive).
- `LicenseRouter` methods now accept the exported `LicenseSubject` structural type instead of requiring a full `ModelEntry` — existing `ModelEntry` callers are source-compatible.
- `GeneratedAsset`, `ArtifactGeneratedEvent`, `AssetManifestEntry`, `ArtifactRecord.model`, and the `list-assets`/`get-generation-events` payloads all gained `modelId?: string` (additive).
- `apps/desktop/package.json` gained an explicit `@metroforge/procedural` dependency (was a phantom/transitive import before).

## Cursor / frontend integration requirements

- All 7 items in `docs/CURSOR_BACKEND_REQUIREMENTS.md` are implemented and typed. The renderer can now call `explainModelRouting`, `getOverworldMap`, `getDungeonGraph`, `getRoomCollision` via the preload bridge, and read `modelId` off `ArtifactGenerated` events / `listAssets()` results — `GenerationStudio.tsx` already reads `modelId` when present per the latest changelog entry, so this should light up without further frontend changes.
- `getOverworldMap`/`getDungeonGraph`/`getRoomCollision` return `{error: string}` (not a thrown IPC error) when a project has no top-down data (e.g. a `SIDE_VIEW_METROIDVANIA` project) — render that message rather than treating an empty/absent field as a crash.
- Not yet exposed: a way to regenerate/resize the top-down world for non-TINY_TEST profiles, since the generator itself doesn't support it yet (see Partial/Next above).

## Tests

- `pnpm build`: 13/13 packages + desktop renderer/electron/preload — clean.
- `pnpm test`: 74 files / 342 tests passing, including the full `generation-e2e.test.ts` TINY_TEST pipeline run.
- New this session: `packages/ai/src/registry.test.ts` (4 tests), `packages/ai/src/model-catalog.test.ts` (+4 tests for `explainModelRouting`).
- Live verification: `metroforge create --archetype TOP_DOWN_ACTION_ADVENTURE --profile TINY_TEST` generated a real project; inspected its actual `data/world/overworld.json` to confirm the new IPC handlers' assumptions match real generator output (POI kinds, dungeon area naming, `locked_door`/`keyId` shape). Disposable project cleaned up after.

## Known problems / risks

- **No file-level isolation between agents for most of this session.** Confirmed both agents writing to the same physical working directory concurrently for a stretch (not separate worktrees), which caused one real build breakage this session had to fix. The other agent has since moved to a real `git worktree` (`../Forged-cursor-desktop`), which resolves this going forward.
- Large amount of uncommitted work was sitting in the working tree with no commit checkpoint for most of the session. Recommend committing on the shared branch rather than leaving long uncommitted stretches, given the shared-filesystem history.
