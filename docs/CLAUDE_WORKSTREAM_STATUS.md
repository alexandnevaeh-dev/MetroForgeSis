# Claude Workstream Status

Backend/generation/runtime/QA workstream status, maintained by the Claude agent working `feature/claude-generation-runtime`. Companion to `docs/PARALLEL_CHANGELOG.md` (append-only log) and `docs/CURSOR_HANDOFF_AUDIT.md` (the other agent's own audit as of 2026-08-13, written from its side).

Last updated: 2026-08-13.

## How this session started

Repo state at session start was far ahead of this session's own prior context: another agent had already implemented most of a large prior backlog (ability framework with 9 real modular abilities, playtest personas + telemetry, quests, dialogue, shops, inventory, minimap, movement-feasibility QA, atomic multi-slot saves, COMMERCIAL_SAFE mode routing, database persistence for artifacts/validation results) and was — verified live, mid-session, via files changing between successive `Read` calls — actively scaffolding a second game archetype (`TOP_DOWN_ACTION_ADVENTURE`) in the same working tree. See `docs/PARALLEL_CHANGELOG.md`'s 2026-08-13 entry for the full account, including a build/test breakage caused by that concurrent work that I fixed (mechanical: stale import paths, a missing-field typo, several test fixtures missing a newly-required schema field).

## Completed (this session, verified)

- Generation-mode expansion (`NVIDIA_ONLY`, `COMMERCIAL_SAFE`, `OFFLINE`, `FASTEST`, `HIGHEST_QUALITY`, `LOW_VRAM`, `BALANCED`) — `RoutingContext`/`ModelMetadata`/`AIProvider` extended, `CapabilityRouter` filters wired, `LicenseRouter` broadened to a reusable structural type. Converged with the other agent's independent `mode-routing.ts`/`catalog-reconciliation.ts` factoring — no lasting conflict.
- Health-aware candidate ranking in `CapabilityRouter.getCandidates()` — closes the one real gap an Explore-agent audit found in `ProviderHealthMonitor` (it existed and was used for dashboards, but nothing fed live provider health into routing decisions).
- Fixed a real, concurrent-edit-caused build/test break across 8 files (see changelog) so both agents have a green baseline to keep building on.

## Verified already complete by the other agent (source-checked, not just doc claims)

An Explore-agent audit against actual source + tests (not `docs/CURSOR_HANDOFF_AUDIT.md`'s own claims) confirmed these are genuinely done, with file:line evidence:

- AbilityCatalog/AbilityController architecture, dash migrated, all 5 core movement abilities (double jump, wall slide, wall jump, air dash, ground slam) real and modular.
- Gate-to-ability validation (`registered_abilities_valid` QA gate) and `MovementFeasibilityValidator` (real jump/dash-reach math, wired as a static QA gate).
- GameDNA movement runtime sync (`data/player/movement.json` written at assembly time, read by `PlayerMovementConfig.gd`).
- Room archetype persistence (13 distinct archetypes assigned and preserved, `room_archetype_fidelity` QA gate).
- Atomic save (temp-file + rename), save migrations, real 3-slot multi-slot save/load.
- Dead-code cleanup: `AbilityGate.gd/.tscn`, `AssetSprite.gd` fully removed; `GodotProjectAssembler.validate()` doesn't exist (never re-added).
- Database persistence: `artifacts` and `validation_results` repositories are called from the real `GenerationPipeline`, not just unit-tested in isolation.

## Partial — real, open gaps

- **Victory-path runtime assertion.** `RuntimeSmokeTest.gd`'s boss-victory check exercises a real signal chain (`take_damage` → `boss_defeated` → `EventBus.game_completed` → `GameManager.VICTORY` → overlay visible) but delivers damage via a direct `take_damage(max_health)` call, not simulated player attack input. `PlaytestRunner.gd` does simulate input-driven combat but with lighter assertions. No single test chains simulated-input combat all the way to `VICTORY`.
- **TOP_DOWN_ACTION_ADVENTURE wiring.** `GAME_ARCHETYPE_PLUGINS` (packages/shared/src/archetypes.ts) and `generateTopDownWorld()` (packages/procedural/src/topdown/world.ts) both exist and work in isolation (tested). `packages/generation/src/pipeline.ts` and `packages/godot/src/assembler.ts` gained their first archetype-branching code mid-session (the other agent, not me — I deliberately avoided editing those functions further given the collision risk of two agents mid-editing the same code at once). Whether a `TOP_DOWN_ACTION_ADVENTURE` project can currently pass real Godot runtime validation end-to-end is **UNKNOWN** as of this checkpoint — the topdown Godot template (`templates/godot-topdown-adventure/`) still had side-view-only ability scripts (WallJump/DoubleJump/etc.) present at last check, suggesting it was mid-adaptation, not yet genre-appropriate.

## Next (recommended, not started by me)

1. Re-survey `packages/generation/src/pipeline.ts` + `packages/godot/src/assembler.ts` fresh (they were changing during this session) before extending archetype branching further.
2. Attempt a live `TOP_DOWN_ACTION_ADVENTURE` TINY_TEST generation end-to-end and report actual Godot headless/runtime validation results — per the "no fake generation" rule, this needs a real pass/fail, not an assumption either way.
3. Close the victory-path gap: extend `PlaytestRunner.gd`'s input-simulated combat loop through to a `VICTORY` assertion, or add an equivalent check in `RuntimeSmokeTest.gd`.
4. `packages/procedural/src/topdown/world.ts`'s dungeon generation is currently hardcoded to exactly 1 dungeon / 4 rooms regardless of profile (TINY_TEST-shaped only) — `TOP_DOWN_PROFILE_DEFAULTS` already has `dungeonCount`/`townCount` for SMALL/MEDIUM/LARGE that aren't yet consumed.

## New contracts / APIs

- `RoutingContext` gained `nvidiaOnly?`, `offline?`, `commercialSafeOnly?`, `maxVramMb?` (all optional — additive, non-breaking).
- `ModelMetadata`/`AIProvider` gained `commercialUse?`, `estimatedSpeed?`, `estimatedQuality?`, `minVramMb?` (optional, additive).
- `LicenseRouter` methods now accept the exported `LicenseSubject` structural type instead of requiring a full `ModelEntry` — existing `ModelEntry` callers are source-compatible, no changes needed on their side.

No IPC/event-contract or database-schema changes this session — nothing here needs frontend integration work.

## Cursor / frontend integration requirements

None from this session's changes — everything above is internal to `packages/ai`'s routing layer, plus mechanical test/type fixes. The archetype-selection UI (if/when `TOP_DOWN_ACTION_ADVENTURE` is exposed as a user-facing choice) will need a typed contract once pipeline/assembler wiring is confirmed working — not ready yet per the "Partial" section above.

## Tests

- `pnpm build`: 14/14 packages clean.
- `pnpm test`: 74 files / 338 tests passing, including the full `generation-e2e.test.ts` TINY_TEST pipeline run.
- New this session: `packages/ai/src/registry.test.ts` (4 tests, health-aware ranking).

## Known problems / risks

- **No file-level isolation between agents.** This session and the other agent were confirmed writing to the same physical working directory concurrently (not separate worktrees), which caused one real build breakage this session had to fix. Recommend an actual `git worktree` split per the original brief's "if avoidable" guidance, since branch name alone does not provide isolation when both agents share one working directory.
- Large amount of uncommitted work (~267 changed/untracked files) was sitting in the working tree at session start with no commit checkpoint — a crash or destructive command from either agent could have lost hours of both agents' work. Recommend committing early and often on the shared branch rather than leaving long uncommitted stretches.
