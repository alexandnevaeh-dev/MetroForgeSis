# METROFORGE — CHANGE HISTORY

Superseded audit findings, moved out of `docs/METROFORGE_CURRENT_BUILD.md` so that document can describe current state only without contradiction. Each entry states the previous (now-false) claim, the current (verified) state, and the evidence used to verify it during either the original 2026-08-14 audit (branch `feature/claude-generation-runtime`, commit `5917bf9`) or the 2026-08-16 refresh pass (commit `827c1f4`) — each entry below says which.

---

## [Superseded 2026-08-16 refresh] TOP_DOWN_ACTION_ADVENTURE autonomous playtest P0 → RESOLVED

**Previous state (2026-08-14 baseline)**: `godot_playtest` failed 2/2 reproduced runs for `TOP_DOWN_ACTION_ADVENTURE`, 3/8 checks passing, blocking `RUNTIME_VALIDATED` status for the archetype. This was the audit's sole P0 blocker.

**Current state**: RESOLVED in commit `1eb4ab3` ("fix(topdown): stop random terrain from generating unreachable POIs and diagonal pinches"). Root cause was terrain generation creating diagonal tile pinches and POIs on blocked/unreachable cells, which froze the autonomous playtest bot before it could complete its route — not a `PlaytestAgent.gd`/transition-timing issue as the baseline audit's own root-cause narrowing had guessed. Verified 18/18 across 2 fresh seeds plus a side-view regression check at the time of the fix, and independently re-verified again during the 2026-08-16 refresh with a brand-new isolated generation (seed `314159`, HEAD `827c1f4`): 18/18 gates, `godot_playtest` 8/8, boss defeated, victory reached, 17.8s. A separate concurrent-with-another-Godot-process attempt during the refresh (seed `920347`) produced a spurious early crash in `PlaytestAgent.gd` — retried alone per the standard "suspect contention, retry once" practice on this heavily-shared branch, and passed clean, confirming the concurrent-run failure was contention, not a regression.

**Evidence**: `1eb4ab3` diff; two independent full-pipeline generation runs during the 2026-08-16 refresh (one clean isolated pass, one contention-affected concurrent run superseded by a clean retry).

---

## [Superseded 2026-08-16 refresh] Production-asset-maturity gate did not block export → now enforceable (opt-in)

**Previous state (2026-08-14 baseline)**: `packages/tools/src/project-export.ts`'s `exportProject()` never read `artifact.maturity` anywhere; a 100%-placeholder project could export successfully with no way to block it.

**Current state**: RESOLVED via two composing commits. `fb62177` first fixed a correctness bug in `inferAssetMaturity()` — a passing critique score alone no longer auto-promotes an artifact straight to `PRODUCTION_READY`; it now stops at `QA_REVIEW`, with `PRODUCTION_READY` requiring explicit caller action. `ef9b8cc` then added an opt-in `requireProductionAssets` option to `exportProject()` (mirroring the existing `requireCommercialSafe` pattern): when set, export is blocked with a real error and a sample artifact list if any artifact's maturity is `PLACEHOLDER`/`BLOCKOUT`/`REJECTED`; otherwise an advisory warning is emitted and default behavior is unchanged. Wired to the CLI as `export --require-production-assets`. Verified end-to-end against a real 100%-placeholder `TINY_TEST` project, which the new flag genuinely blocked.

**Evidence**: `fb62177` and `ef9b8cc` diffs; `ef9b8cc`'s own commit message documents the end-to-end verification; `packages/tools/src/project-export.test.ts` (7/7 passing, including new coverage for the flag).

---

## [Superseded 2026-08-16 refresh] 3 of 4 vestigial top-down gate scripts removed

**Previous state (2026-08-14 baseline)**: `GrapplePoint.gd`/`PhaseBarrier.gd`/`WaterZone.gd`/`WeakFloor.gd` all present in the top-down template but never instantiated by the top-down generation path — flagged as harmless dead code.

**Current state**: `657c712` removed the first 3 (`.tscn`+`.gd`, 6 files) after confirming via grep that no script or the room assembler ever references them. `WeakFloor.gd`/`.tscn` was deliberately kept — it's still listed in `validator.ts`'s top-down `REQUIRED_FILES`, so removing it would regress the `required_files` QA gate even though the script itself is equally dead from a gameplay perspective. Changing what the gate enforces was scoped out as a separate decision from dead-code removal.

**Evidence**: `657c712` diff and commit message; `packages/qa/src/validator.ts`'s top-down `REQUIRED_FILES` list (still includes `WeakFloor`, does not include the other 3).

---

## [Superseded 2026-08-16 refresh] `ModelScout` had no dedicated test file → now tested

**Previous state (2026-08-14 baseline)**: `ModelScout` existed and was live-wired (`scout-models` IPC, CLI `models scout`) but had zero dedicated test coverage.

**Current state**: `827c1f4` added `packages/ai/src/model-scout.test.ts` with 12 passing tests.

**Evidence**: `827c1f4` diff; `pnpm test` refresh run (2026-08-16) shows `model-scout.test.ts` passing.

---

## [Superseded] "Only dash works" → 9 registered abilities, 6 FULL / 3 PARTIAL

**Previous state**: earlier audit sections claimed dash was the only functioning ability, with other movement abilities either unimplemented or stubbed.

**Current state**: `packages/shared/src/registered-abilities.ts` currently registers exactly 9 abilities (dash, double_jump, wall_slide, wall_jump, air_dash, ground_slam, grapple, swim, phase), mirrored 1:1 in `templates/godot-metroidvania/scripts/player/AbilityRegistry.gd`. All 9 have real, non-stub GDScript physics implementations. 6 (dash, double_jump, ground_slam, grapple, swim, phase) have dedicated gate mechanisms (physical obstacle scenes: `WeakFloor.gd`, `GrapplePoint.gd`, `WaterZone.gd`, `PhaseBarrier.gd`), dedicated save coverage, and dedicated runtime-gate validation. 3 (wall_slide, wall_jump, air_dash) are real and generation-assigned but lack a distinct physical obstacle prop.

**Evidence**: direct read of `registered-abilities.ts`, `AbilityRegistry.gd`, and all 9 `scripts/player/abilities/*.gd` files; `packages/procedural/src/world.ts` ability-gate assignment; `packages/godot/src/room-assembler.ts`'s `deriveWeakFloors`/`deriveGrapplePoints`/`deriveWaterZones`/`derivePhaseBarriers`; `RuntimeSmokeTest.gd`'s `_check_ability_gated_transition`.

---

## [Superseded] "Reach/BossKill only" quest objectives → 10 objective types, generator/runtime parity

**Previous state**: earlier audit found the quest generator producing only `Reach` and `BossKill` objective types, with the runtime capable of more but never exercised.

**Current state**: `packages/procedural/src/content.ts` currently generates 10 objective types (`Reach, Kill, Collect, Talk, AbilityAcquire, Discover, Activate, Interact, Choice`, rotated per quest, plus a final `BossKill`). `templates/godot-metroidvania/scripts/core/QuestManager.gd` tracks exactly the same 10 types via EventBus listeners — no subset mismatch in either direction. `QuestManager.gd` is byte-identical between the two archetype templates.

**Evidence**: direct read of `content.ts:129-212` and `QuestManager.gd:70-99`.

---

## [Superseded] Manual runtime validation required → automatic by default

**Previous state**: earlier audit found that Godot runtime/playtest validation only ran when a developer separately remembered to invoke `metroforge validate --runtime`; a normal `create`/`generate` call did not exercise it.

**Current state**: `godot_imports`, `godot_runtime`, `godot_playtest`, and `gameplay_screenshot_qa` all run automatically inside every normal `create`/`generate` pipeline call whenever Godot is detected. `packages/generation/src/pipeline.ts` contains an explicit inline comment documenting this as a deliberate fix superseding the old easy-to-forget manual-invocation design. Confirmed directly: all 4 real generation runs performed during this audit executed the full 18-gate set (or fewer, honestly, when `--skip-runtime-validation` or missing Godot applied) without any separate `validate` call.

**Evidence**: `pipeline.ts` inline comment and gate-invocation code; 4 live `metroforge create` runs this session, all producing full `RUNTIME_VALIDATED`/`FAILED` outcomes without a separate `validate` step.

---

## [Superseded] Room-archetype data loss on publish → fixed via `resolvePublishedArchetype()`

**Previous state**: earlier audit found that rooms could silently lose their intended world-graph archetype during publish/assembly — every boss room in a top-down dungeon was cited as an example — collapsing to a generic `'combat'` archetype regardless of what the world graph specified.

**Current state**: `packages/godot/src/room-assembler.ts`'s `resolvePublishedArchetype()` now preserves the world-graph-assigned archetype verbatim whenever it's a recognized value, falling back to `'combat'` only for genuinely unrecognized tags. A regression-detection gate, `auditRoomArchetypeFidelity()`, feeds the QA gate `room_archetype_fidelity`, which passed in every real generation run performed during this audit (side-view: "8 matched, 1 intentional override"; top-down: "4 matched, 0 overrides").

**Evidence**: direct read of `room-assembler.ts`'s `resolvePublishedArchetype()` and `auditRoomArchetypeFidelity()`; `room_archetype_fidelity` gate results from 4 live generation runs this session.

---

## [Superseded] Missing cancellation → real cooperative cancellation

**Previous state**: earlier audit found generation cancellation to be UI-only or unimplemented.

**Current state**: `packages/shared/src/cancellation.ts` provides real `AbortSignal`-based cooperative cancellation (`GenerationCancelledError`, `throwIfCancelled()`, `mergeAbortSignal()`), threaded through the full pipeline and caught at the top-level `run()`, which marks the in-flight phase `CANCELLED` and persists job/project status as `cancelled` in the database. `apps/desktop/electron/generation-queue.ts`'s `GenerationQueue` class wires a genuine per-job `AbortController`. This is exercised by 5 passing tests (`cancellation.test.ts`) plus 2 passing tests (`generation-queue.test.ts`).

**Evidence**: direct read of `cancellation.ts`, `pipeline.ts`'s `finalizeCancellation()`, and `generation-queue.ts`'s `cancel()` method.

---

## [Superseded] Missing playtest personas → 2 real personas implemented

**Previous state**: earlier audit found playtest persona support unimplemented or planned-only.

**Current state**: `packages/procedural/src/playtest-persona.ts` defines exactly 2 real personas — `victory_rusher` (fast pacing, 8s walk / 12s boss timeout) and `ability_collector` (patient pacing, 12s / 14s, collects all pickups) — auto-selected per generation profile size via `defaultPlaytestPersonaForProfile()`. Both are consumed by the real input-simulating `PlaytestAgent.gd` in both archetype templates.

**Evidence**: direct read of `playtest-persona.ts`; `playtest_route.json` from 4 live generation runs this session, each embedding a real `persona` object.

---

## [Superseded] "Dead" validation database → `validation_results` table is wired and active

**Previous state**: earlier audit flagged the validation-results database table as written but never read (dead).

**Current state**: `validation_results` currently has both a real writer (`ValidationResultRepository.create`, called from `pipeline.ts`) and a real reader (`listByProject`, called from `apps/desktop/electron/handlers.ts`'s `get-validation-results` IPC handler, which backs the QA screen). This specific table is now ACTIVE.

**Important — do not over-generalize this fix**: three *other* database tables (`generation_jobs`, `generation_stages`, and the DB-layer `artifacts` table, distinct from the JSON `generation_manifest.json`) remain write-only today — their repository `findById`/`listByJob` reader methods have zero call sites anywhere outside their own definitions. This is a separate, still-current finding (see `METROFORGE_CURRENT_BUILD.md` Step 35/39 P2) and should not be treated as resolved by this entry.

**Evidence**: direct read of `packages/database/src/repositories/validation-result.ts` (or equivalent), `handlers.ts`'s `get-validation-results` handler, and a grep-confirmed absence of any external caller for `JobRepository.findById`/`ArtifactRepository.listByJob`.

---

## [Resolved] ModelDownloadManager command/Python injection

**Previous state**: earlier audit flagged `packages/ai/src/model-download-manager.ts` as vulnerable to shell/command injection when invoking `python`/`pip`/download tooling, via string-concatenated shell execution of user-controlled model/repo identifiers.

**Current state**: RESOLVED. The file uses `execFileSync`/`spawn` with argv arrays exclusively — no `exec`/`execSync` with string concatenation exists anywhere in it. Confirmed call sites: `spawn('ollama', ['pull', model.id], {...})`; `execFileSync('huggingface-cli', ['download', repo, '--local-dir', targetDir], {...})`; and the Python invocation passes `repo`/`targetDir` as real argv elements (`sys.argv[1]`/`[2]`), never interpolated into the `-c` source string itself. Additionally, `assertSafeModelIdentifier()` validates every model/repo identifier against a strict allowlist regex (`/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)?$/`) and explicitly rejects `..`/`://` before every adapter's `download()` call — defense-in-depth on top of the already-safe argv-array approach.

**Evidence**: direct read of `model-download-manager.ts`; 12 passing tests in `model-download-manager.test.ts`.

---

## [Resolved] CLI slug path traversal

**Previous state**: earlier audit flagged CLI commands taking a project `<slug>` argument as vulnerable to path traversal (e.g. `../../etc/passwd`-style slugs escaping the intended `GeneratedGames/` root).

**Current state**: RESOLVED. `packages/shared/src/paths.ts`'s `resolveProjectPathSafe()` is the single canonical choke point: it rejects empty slugs, `/`, `\`, `..`, null bytes, control characters, and anything not matching a strict bare-slug regex, then independently re-verifies the resolved path is a direct child of the approved root (not just string-prefix-matched), and follows symlinked roots to their real location before comparing. It is wired into every slug-taking CLI command (`create`, `validate`, `export`, `open`, `accept`, and the `project` subcommand family via `resolveProjectBySlug()`).

**Evidence**: direct read of `paths.ts` and every CLI command file that calls `resolveProjectPathSafe`; 17 passing tests in `paths.test.ts`, covering traversal, nested traversal, absolute paths, Windows drive-letter injection, UNC paths, null bytes/control characters, and symlink-root following.

---

## Note on items NOT superseded — still current, do not treat as fixed

The following limitations from prior audit passes were re-verified and remain genuinely true today (re-checked again during the 2026-08-16 refresh unless noted). They are intentionally **not** listed above and remain in `METROFORGE_CURRENT_BUILD.md` as current blockers/gaps:

- **"Fixed rectangular floor/wall" tileset layout** — a real per-cell `tileCells` system exists, but only for the manual room-edit path; automatic/initial room generation still falls through to the fixed floor/wall fallback in `RoomTileMap.gd`. Do not mark this resolved.
- **No AI-generated GDScript** — the `GDSCRIPT` routing capability is registered in the model catalog but has zero real call sites in the generation pipeline, by explicit design. This was true before the baseline audit and remains true as of the 2026-08-16 refresh.
- ~~**Production-asset-maturity gate does not block export**~~ — **RESOLVED 2026-08-16**, see the superseded entry above. Do not cite this bullet as current; it is kept here only so anyone diffing this file against an older copy can see explicitly that it moved, rather than silently disappearing.
