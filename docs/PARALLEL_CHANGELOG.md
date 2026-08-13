# Parallel Development Changelog

Append-only log of changes made by each agent working this repo concurrently. Keep entries short — link to `docs/CLAUDE_WORKSTREAM_STATUS.md` for the fuller narrative.

---

## 2026-08-13 — CLAUDE

**Branch:** `feature/claude-generation-runtime` (created from `master` at commit `a40914c`, preserving all pre-existing uncommitted work from prior sessions and from a concurrently-active agent — see note below).

### Context

On starting this session, `git status` showed ~267 changed/untracked files already in the working tree — far more than this session's own history accounted for. An untracked `docs/CURSOR_HANDOFF_AUDIT.md` (dated today) confirmed another agent had already implemented most of a prior Claude backlog (ability framework, playtest personas, quests, dialogue, shops, movement-feasibility QA, COMMERCIAL_SAFE routing) and had begun scaffolding a second game archetype (`TOP_DOWN_ACTION_ADVENTURE`) directly in this same working tree. Files continued changing under active `Read`/`Grep` calls during this session (e.g. `packages/schemas/src/core.ts`, `packages/shared/src/constants.ts`, `packages/shared/src/archetypes.ts`, `templates/godot-topdown-adventure/`), confirming a second agent was live-editing the same filesystem path concurrently, not a separate worktree.

### Changes this session

- **Generation-mode expansion** (`packages/ai/src/types.ts`, `registry.ts`, `license-router.ts`) — extended `RoutingContext` with `nvidiaOnly`/`offline`/`commercialSafeOnly`/`maxVramMb`; extended `ModelMetadata`/`AIProvider` with `commercialUse`/`estimatedSpeed`/`estimatedQuality`/`minVramMb`; broadened `LicenseRouter.classify()` to a structural `LicenseSubject` type so it works against both `ModelEntry` and the lighter provider/model-metadata shapes. Wired into `CapabilityRouter.getCandidates()`/`getModelCandidates()` as real filters. (The other agent independently factored the mode→flags mapping into `mode-routing.ts` and catalog reconciliation into `catalog-reconciliation.ts` in parallel — those superseded an inline draft of the same logic in `generation-router.ts`/`bootstrap.ts`; no conflict, just converged on a cleaner shape.)
- **Health-aware provider ranking** (`packages/ai/src/registry.ts`) — `CapabilityRouter.getCandidates()` now sorts healthy providers before degraded before unavailable (secondary key: existing `priority`), without ever excluding a candidate on health alone — `FallbackManager`'s retry path still covers the case where the top-ranked candidate fails anyway. This was the one open item from `ProviderHealthMonitor` (Step 8 of the original backlog): the monitor itself was already built and used for dashboards, but nothing fed `provider.health` into actual routing decisions until now. 4 new tests in `packages/ai/src/registry.test.ts`.
- **Build/test breakage fix from concurrent edits** (not a design change — mechanical cleanup):
  - `packages/procedural/src/topdown/world.test.ts` — import paths were wrong for the file's new location (`../src/topdown/world.js` → `./world.js`, `../src/world.js` → `../world.js`); added explicit param types to satisfy `noImplicitAny`.
  - `packages/procedural/src/topdown/world.ts` — stray reference to an out-of-scope `dungeonItem` inside `buildTinyDungeon()` fixed to use the actual in-scope `dungeonItemId` param; 4 `WorldGraph` edge literals were missing the now-required `optional` field.
  - `GameDNA` fixture literals in 6 test files (`packages/procedural/src/bibles.test.ts`, `packages/godot/src/assembler.test.ts`, `packages/assets/src/asset-pipeline.test.ts`, `packages/generation/src/dialogue-voice.test.ts` ×2, `packages/generation/src/project-memory-service.test.ts`) were missing the newly-added required `archetype` field (zod's `z.infer` uses the *output* type, so a `.default()`-bearing field is still required in the TS input type).
  - `packages/schemas/src/core.test.ts` — two `GameDNASchema.parse(dna)` round-trip assertions needed `archetype` added to the input fixture, since `.parse()` now legitimately adds it via the schema default.
  - Verified via full `pnpm build` (14/14 packages) and `pnpm test` (74 files / 338 tests) after each fix — all green.

### Contracts / APIs touched

- `RoutingContext`, `ModelMetadata`, `AIProvider` (packages/ai/src/types.ts) — additive optional fields only, no breaking changes.
- `LicenseRouter.classify()`/`isCommercialSafe()`/`filterCommercialSafe()` signatures widened from `ModelEntry` to the new exported `LicenseSubject` structural type — `ModelEntry` still satisfies it, so existing callers are unaffected.

### Tests executed

- `pnpm build` — 14/14 packages, clean.
- `pnpm test` — 74 files, 338 tests, all passing (includes the pre-existing `generation-e2e.test.ts` full TINY_TEST pipeline run).

### Known gaps handed back for whoever picks up next

- `packages/shared/src/archetypes.ts` (`GAME_ARCHETYPE_PLUGINS`) and `packages/procedural/src/topdown/world.ts` (`generateTopDownWorld`) exist and work in isolation, but as of this checkpoint `packages/generation/src/pipeline.ts` and `packages/godot/src/assembler.ts` had just gained their first archetype-branching code mid-session (by the other agent) — I did not attempt to also edit those files given the collision risk of two agents mid-editing the same function. Worth a fresh `git status`/read-through before extending them further.
- The victory-path runtime assertion (`RuntimeSmokeTest.gd`) still proves the win-state signal chain via a direct `take_damage(max_health)` call rather than fully simulated input-driven combat — `PlaytestRunner.gd` has the input-simulation half but lighter assertions. No single test yet chains simulated combat input all the way to `VICTORY`.
