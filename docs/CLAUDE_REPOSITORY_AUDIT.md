# MetroForge AI — Repository Audit

Author: Claude Code (continuation session). Date: 2026-08-10/11.
Method: build/typecheck/test/lint executed against real toolchain, source files read directly
(not inferred from docs), one full generation run executed end-to-end from a clean CLI invocation
with no Godot/Ollama/FFmpeg installed to observe actual fallback behavior.

## Summary verdict

`docs/BUILD_STATUS.md` claims "Feature Complete (v0.1.0)" through "Pass 23." That claim is
**accurate for a specific, narrower scope**: a working vertical slice — prompt → deterministic
Game DNA/world/progression → procedural content/audio/assets → assembled Godot 4 project → QA
gates → optional Godot headless validation — genuinely runs, with no commits yet in this repo
(working tree was entirely untracked at session start). It is **not** accurate against the full
76-section ambition of a model-agnostic platform with vision QA loops, character identity,
ControlNet-style conditioning, video-model animation, embeddings/RAG project memory, model
lifecycle management, checkpointed/resumable jobs, or licensing enforcement — those systems were
never started, not merely stubbed.

Codebase size: ~8,700 lines across 91 TypeScript source files (excluding tests/dist), spread over
13 workspace packages/apps. This is a focused, well-architected implementation, not a large
half-built one. Architecture choices (capability-based routing, provider plugin interface,
deterministic-then-AI generation order, procedural fallback on every AI call) closely match the
prescribed principles in section 6, 26, and 72 of the continuation spec.

## What actually works (verified, not assumed)

- **Build**: `pnpm build` — all 13 packages compile clean (tsc + vite for desktop/electron).
- **Typecheck**: `pnpm typecheck` — clean across all packages.
- **Tests**: `pnpm test` — 35/35 passing across 15 files (thin coverage relative to scope; see
  Implementation Status matrix).
- **Lint**: was reporting 3,604 errors — turned out to be 100% noise from linting compiled
  Electron output (`dist-electron/`) that the ignore list failed to exclude. Fixed (see below);
  real lint surface was exactly 1 error.
- **Live end-to-end run**: executed `node apps/cli/dist/index.js create --prompt "..." --profile
  TINY_TEST --mode LOCAL_ONLY` in this session with **zero** local tools installed (no Godot, no
  Ollama, no FFmpeg — confirmed via `doctor`). Pipeline completed all 9 phases, produced 83
  registered assets, 6/6 static QA gates passed, deterministic Game DNA/world/audio fallbacks
  engaged correctly, no crash. This is strong evidence the FREE_ONLY/LOCAL_ONLY "must never hard
  fail" requirement (section 10, 71) is genuinely honored for the implemented capability set.
- **Desktop app is real, not a mockup**: `apps/desktop/electron/handlers.ts` wires every
  `window.metroforge.*` IPC call in `App.tsx` to actual package calls (`GenerationPipeline`,
  `bootstrapProviders`, `ToolRegistry`, `ModelScout`, `HardwareProfiler`) — no fake data, no
  `setTimeout`-simulated progress. Generation progress streams over a real IPC event
  (`generation-progress`).
- **Provider architecture matches the model-agnostic principle**: `GenerationRouter` /
  `CapabilityRouter` / `FallbackManager` in `packages/ai` route by capability, not by hardcoded
  model name; concrete providers (Ollama, Gemini, Groq, OpenRouter, HuggingFace) implement a
  shared `TextGenerationProvider` interface behind the router.
- **"AI proposes, algorithms prove" is real, not aspirational**: `AssetPipeline` always produces a
  procedural fallback image first, only overwrites with AI output on success, always runs
  `runDeterministicAssetChecks` (PNG structural validation) regardless of VLM availability, and
  only additionally engages the VLM critic (Ollama vision model) when reachable.
- **Godot project generation produces a real, previously-validated project**: two fixtures already
  exist under `GeneratedGames/` with `validation_report.json` showing `passed: true` across all 6
  gates, including `required_scenes_exist` (8 rooms) — this was not fabricated for this audit, it
  predates this session (timestamped today from an earlier run) and was independently reproduced
  during this audit.

## Bugs found and fixed this session

1. **`eslint.config.js` — masked lint signal.** The ignore glob `**/dist/**` does not match
   `apps/desktop/dist-electron/`, a distinctly-named build output directory. ESLint was linting
   minified/compiled Electron bundles, producing 3,604 fake errors that would drown out any real
   signal in CI or local runs. Fixed by adding `**/dist-electron/**` to ignores. Real lint surface
   after the fix: 1 error (see #2).
2. **`packages/procedural/src/world.ts:143`** — `let to = …` never reassigned; `prefer-const`
   violation, the one real lint finding. Fixed.
3. **`packages/generation/src/pipeline.ts:307`** —
   `db.projects.updateStatus(project.id, qaReport.passed ? 'complete' : 'complete')`. Both ternary
   branches were identical, meaning the project status never actually reflected QA outcome (there
   is no `complete_with_warnings` status in the schema, so this was likely a leftover from a
   refactor). Simplified to `'complete'` — behavior unchanged, dead/misleading logic removed.
4. **`packages/ai/src/bootstrap.ts:52`** — `enabled: config.mode !== 'CUSTOM' || true`. This
   boolean expression is always `true` regardless of `config.mode` (the `|| true` short-circuits
   everything before it), so the apparent per-mode gating was dead code. `OllamaProvider`'s own
   constructor already defaults `enabled` to `true`, so behavior is unchanged; the misleading
   expression was simplified to `enabled: true`.
5. **`generation_manifest.json` artifacts array was always `[]`.** `GodotProjectAssembler` had the
   asset-manifest requirement (spec section 38/59) structurally present but never populated — the
   rich per-asset metadata computed by `AssetPipeline` (provider, fallback flag, VLM critique
   pass/score) was discarded when assets were flattened into a `Map<path, Buffer>` before being
   passed to the assembler. Wired `AssetPipeline`'s `GeneratedAsset[]` metadata through
   `GenerationPipeline` into a new `AssemblyInput.assetMetadata` field, and the assembler now also
   derives audio artifact entries from `audioFiles`. Verified with a fresh end-to-end run: manifest
   now contains 83 real artifact records (73 textures + 10 audio) instead of an empty array. This
   is the one substantive implementation gap fixed this session, not just a code-quality nit.

All four code fixes plus the manifest wiring were re-verified: `pnpm build`, `pnpm typecheck`,
`pnpm test` (35/35), `pnpm lint` (0 errors), and a fresh `create` run all pass after the changes.

## Follow-up session (2026-08-10/11, same day, continued from "continue")

Four of the five "Recommended next priorities" below were implemented and live-verified in a
second pass:

1. **`config/providers.default.json` wired in.** `bootstrap.ts` now loads it and uses its
   `priority` values for every provider (previously Gemini/Groq/OpenRouter/HuggingFace all silently
   tied at the same default priority of 50 despite the file declaring 80/75/60/50 — a real,
   previously-unnoticed bug, not just dead config). `enabled` for hosted providers deliberately
   still gates on API-key presence (not the file) to avoid regressing the documented
   enable-via-`.env` UX; Ollama's `enabled`/`priority` now come from the file with safe defaults.
2. **`RepairEngineer` expanded.** Beyond the pre-existing missing-manifest case, it now repairs
   `input_actions_exist` failures by restoring the canonical `[input]` InputMap section from the
   runtime template (CRLF-safe). Covered by 3 new tests in `packages/qa/src/validator.test.ts`.
3. **Job checkpointing added.** Two real, previously-dead gaps closed:
   - `generation_stages` DB rows (schema existed, was 100% write-once-at-creation, never updated)
     now get real status/timestamps written as each phase runs — verified by querying the sqlite
     DB directly after a live run.
   - `game_dna.json` is now written to disk immediately after the Game DNA phase (previously only
     written at final assembly, so a crash mid-pipeline lost it). `GenerateOptions.resume` (CLI:
     `--resume`, on by default for `metroforge generate`) skips the AI/network-dependent Game DNA
     phase entirely when a checkpoint already exists, loading and schema-validating it instead.
     Project creation was also made idempotent (`findBySlug` before `create`) so a resumed run
     against an existing slug no longer crashes on a UNIQUE constraint violation. Verified live:
     ran `create` twice against the same prompt, second run with `--resume` reported
     `game_dna: SKIPPED (Resumed from existing game_dna.json checkpoint)` and completed normally.
   - Scope note: only the Game DNA phase is checkpoint-skippable. Everything downstream (world,
     content, audio, assets) is deterministic given `(gameDna, seed)`, so recomputing it on resume
     is cheap and intentionally not special-cased — only the non-deterministic, network-dependent
     step is worth skipping. Full arbitrary-phase resume (spec §39/40) is still not implemented.
4. **`ModelBenchmarkService` now runs a real probe.** For installed, reachable Ollama models it
   sends one real `/api/generate` call with a fixed JSON-only prompt, measures actual latency, and
   scores JSON compliance from the real response — falling back to the prior heuristic for
   unreachable servers, non-Ollama providers, or malformed responses. Not a full benchmark suite
   (code/reasoning sub-scores are still heuristic-derived — a single probe can't reliably measure
   those without a much larger, slower eval set), but no longer 100% fabricated. Covered by 5 new
   tests with a mocked `fetch` in `packages/ai/src/model-benchmark.test.ts`.

All four changes were re-verified after implementation: `pnpm build`/`typecheck`/`test`
(44/44)/`lint` clean, plus two live end-to-end `create` runs (one fresh, one `--resume`) and a
direct sqlite query confirming real stage-status persistence.

5. **`AssetPipeline` checkpointing.** Extended the same `resume` mechanism into asset generation:
   player/enemy/boss sprites are now written to disk as soon as they're produced (previously held
   in memory until final assembly, so a crash mid-generation — the phase most likely to be slow
   when a real local diffusion model is in use — discarded all completed image generation work).
   On `--resume`, each of those sprites is loaded from its checkpoint file instead of being
   regenerated, marked `provider: "checkpoint"` in `generation_manifest.json`. Verified live:
   ran `create` twice, second run with `--resume` showed 4 checkpoint-sourced artifacts
   (player + 2 enemies + boss) in the manifest with byte-identical buffers to the first run.
   Deliberately scoped to single-image sprite assets only — tileset generation was left
   unchanged because its checkpoint would need to capture the pre-pixel-art-processing buffer to
   avoid re-running palette reduction on an already-reduced image, which needs more care than the
   time budget allowed this session; flagged as a follow-up, not silently skipped.
   Walk-cycle sheets and tile slices were left unchanged — they're purely procedural, deterministic,
   and instant, so there's nothing to checkpoint. 2 tests added/updated in
   `packages/assets/src/asset-pipeline.test.ts` (the pre-existing test previously used a fake,
   unwritten `/tmp/test` path; now uses a real cleaned-up tmpdir since the pipeline writes files).

## Confirmed disconnected / dead systems

- ~~`config/providers.default.json` never read~~ — **fixed above.**

## Confirmed stub (not broken, explicitly heuristic where it remains so)

- **`ModelBenchmarkService`** — **upgraded above** for the Ollama case; still heuristic-only for
  hosted providers (Gemini/Groq/OpenRouter/HuggingFace), which aren't yet wired for a cheap
  single-shot probe the way Ollama's local `/api/generate` is.

## What is missing entirely (never attempted — not broken, not stubbed, absent)

Confirmed by file/symbol search across the full source tree (no matches found for any of these):

- Character identity / reference-image consistency system (spec §18)
- Video/animation model adapters — AnimateDiff, SVD, CogVideoX, etc. (spec §20)
- ControlNet / IP-Adapter / T2I-Adapter conditioning — `ComfyUIProvider` is explicitly a "minimal
  txt2img workflow" only (its own doc comment), Flux-schnell checkpoint hardcoded (spec §15)
  and `providers/diffusers.ts` similarly txt2img only.
- Dedicated background-removal / segmentation / upscale / depth-estimation providers (spec §21) —
  `PixelArtProcessor` does real deterministic cleanup (palette reduction, resizing, tile slicing)
  but there is no rembg/SAM/Real-ESRGAN-style adapter.
- Embeddings, reranking, or project memory / RAG (spec §24)
- Automated playtesting beyond static progression-graph reachability (`validateReachability` in
  `packages/procedural/src/world.ts` proves ability-gated paths are reachable — real and useful —
  but there is no simulated agent that actually steps through rooms) (spec §35)
- Job pause/resume/cancel or checkpoint-and-resume-after-restart (spec §39, §40). `GenerationPipeline.run()`
  is one long async function; if it throws or the process dies mid-run, all prior phase work is
  lost on next attempt. There is a `jobs` table/repository in the database package, but nothing
  reads it back to resume a job.
- Model lifecycle (load/warm/idle/unload) memory management (spec §41)
- Speech generation/recognition, 3D generation (spec §22, spec's model family lists)
- License-aware "commercial-safe" export gating (spec §57) — `ModelEntry`/provider objects do
  carry a `license` string field, but nothing reads or enforces it as a gate.
- Export manifest as a distinct artifact beyond `generation_manifest.json` (which now, after this
  session's fix, does carry asset provenance — see above) — Godot version, tool versions, and
  playtest status are not yet included in it (spec §59).

None of the above should be read as "the project is behind schedule" — they were never started,
which is different from "broken." Given the size of the actual spec (76 sections covering a
platform on the scale of a small studio's internal tooling), the existing repo represents a
reasonable, disciplined P0 vertical slice, not a sprawling half-finished mess.

## Security / safety spot-check

- No `.env` file present on disk (only `.env.example`); `.gitignore` correctly excludes `.env`,
  `*.db`, `node_modules/`, `dist/`, `GeneratedGames/`, `apps/desktop/dist-electron/`.
- `execSync` is used for Godot headless validation and tool detection
  (`packages/qa/src/validator.ts`, `packages/tools/src/registry.ts`, `packages/godot/src/assembler.ts`)
  with fixed, code-controlled command strings — the only interpolated value is
  `godotPath`/`projectPath`, which come from local config/generated output paths, not from
  arbitrary user/network input. No obvious command-injection surface found in this pass.
- No secrets, API keys, or credentials found committed in tracked/untracked source.

## Recommended next priorities (in order)

Items 1–5 from the original list are done (see "Follow-up session" above). A sixth item was
added and completed too:

6. **`RepairEngineer` extended to `player_spawn_valid` and `main_scene_starts`.** These turned
   out not to need re-running assembly — `scenes/player/Player.tscn`, `scenes/world/World.tscn`,
   and `scripts/player/PlayerController.gd` are copied from the runtime template verbatim and
   never modified per-project, so they're safely restorable by file copy (same pattern as the
   input-actions repair). `project.godot` and `scenes/boot/Main.tscn` *are* per-project modified
   (title text patched in), so their repair paths restore the template file and then reapply the
   title patch from the project's persisted `game_dna.json` — same logic the assembler itself
   uses, kept in sync rather than duplicated ad hoc.
   **Bigger finding while wiring this in: the standalone `metroforge validate <slug>` CLI command
   never invoked `RepairEngineer` at all.** `RepairEngineer` was only reachable from inside the
   full `generate`/`create` pipeline, where these particular gates essentially never fail (if
   assembly just succeeded, the files it uses are unlikely to already be missing) — meaning this
   repair capability was practically unreachable for its real motivating scenario: a user whose
   project got manually corrupted, wanting to fix it *without* regenerating. Added `--repair` to
   `validate`. Live-verified end to end: generated a project, deleted `project.godot`,
   `scenes/boot/Main.tscn`, and `scenes/player/Player.tscn`, ran
   `metroforge validate <slug> --repair`, all 3 files were restored with the correct game title
   reapplied (verified by grepping the restored files), and all 6 static QA gates passed on
   re-validation. 3 new tests in `packages/qa/src/validator.test.ts`.
   `required_scenes_exist` (missing room `.tscn` files) remains intentionally unrepaired — those
   are procedurally unique per project, not static template files, so there's no deterministic
   file to restore; the honest fix there is regeneration, not patching.

7. **Tileset checkpointing.** Before implementing, traced through `PixelArtProcessor.process()`
   (`packages/assets/src/pixel-art-processor.ts`) to confirm it's actually idempotent at matching
   target dimensions/palette: nearest-neighbor scale to the same size is an exact identity copy
   (`floor(x/1) === x`), palette quantization maps already-palette colors to themselves (distance
   0 always wins ties), and `alignToGrid`'s "donor" grid-corner pixels are never themselves
   mutated by the pass that reads from them. That confirmation meant the same simple pattern used
   for sprites — cache the final processed buffer, skip regeneration entirely on `--resume` — was
   safe to use here too, rather than the more complex pre-processing-buffer cache originally
   flagged as necessary. Per-tile slice files are still recomputed fresh from the cached source
   each run (cheap, pure JS, no AI/network involved — nothing to gain by caching them separately).
   Verified live: two `create` runs against the same prompt, the `--resume` run showed the
   tileset among 5 checkpoint-sourced artifacts (previously 4) in `generation_manifest.json`.
   Test assertions added to the existing resume test in
   `packages/assets/src/asset-pipeline.test.ts`, including a byte-for-byte check that all
   individual tile slices produced from the checkpointed source match the original run.

8. **Fixed a real correctness bug: the `progression_graph` QA phase was a dead no-op.**
   `generateWorldTopology()` (`packages/procedural/src/world.ts`) builds a `progressionGraph` —
   a linear Start → ability_0 → ability_1 → … → Final Boss chain meant to prove abilities are
   obtainable in an order that actually unlocks the path to the boss (spec §27, §35). Its edge
   `requires` field was computed by a condition (`i > 0 && progressionNodes[i].type === 'room'`)
   that can **never** be true — only index 0 is ever `type === 'room'`, and that branch requires
   `i > 0`. Confirmed by direct execution: every single edge in the constructed graph had
   `requires: []`, for every seed and profile tested. `validateReachability()` — which correctly
   implements progressive ability-unlocking internally — therefore always reported `reachable:
   true` no matter what was actually gated, because there was nothing to fail. Compounding this,
   `pipeline.ts` called `validateReachability(progressionGraph, new Set(abilityIds))`, pre-seeding
   *every* ability as already unlocked before traversal even started — so even a correctly-gated
   graph would have validated trivially. Net effect: this QA gate has never been able to catch a
   broken/unreachable progression, in any run, ever.
   **Fix:** the edge leaving each ability node now requires that node's own ability
   (`fromNode.type === 'ability' ? [fromNode.label] : []`), and the pipeline now seeds
   `validateReachability` with an empty set so the traversal actually proves abilities are
   discoverable in sequence, not pre-granted. Verified the bug and the fix directly: before the
   fix, `node -e` against the built package showed `requires: []` on every edge; after the fix,
   added a test (`packages/procedural/src/world.test.ts`) that deletes an ability node from the
   graph and confirms `validateReachability` now correctly reports the boss as unreachable — proof
   the gate is load-bearing, not just re-passing by construction. Live-verified generation still
   succeeds end-to-end across TINY_TEST/MEDIUM/LARGE profiles and multiple seeds with the real gate
   active (112 and 217-room worlds both passed `progression_graph` legitimately, not vacuously).

9. **Removed dead duplicate `detectSoftLocks()`.** Confirmed by grep it had zero call sites
   anywhere in the codebase (only its own definition, its export, and stale `dist/` artifacts) —
   it was a one-line wrapper around `validateReachability()` returning the identical
   `unreachableNodes` list under a different name. Deleted it and its export from
   `packages/procedural/src/index.ts` per spec §67 (duplicate architecture with zero consumers is
   safe to remove outright, no migration needed). Rebuilt/retested clean.

   **While tracing its would-be callers, found the deeper gap this dead function was probably
   meant to eventually cover:** even after fixing the ability-gating bug above, the
   `progression_graph` QA phase only validates the small *abstract* chain
   (Start → ability_0 → … → Final Boss, typically 3–6 nodes) — it never validates the actual
   `worldGraph` that gets assembled into real rooms (confirmed by grep: `worldGraph` is passed to
   the Godot assembler but never to any reachability check). `worldGraph` edges do carry real
   per-shaft `requirements: string[]` for ability gates, so a proper room-level reachability proof
   is structurally possible — but `worldGraph` room nodes don't record *where* an ability is
   picked up (only the abstract `progressionGraph` has ability-typed nodes), so there's no
   existing data tying "reaching this specific room" to "gaining this specific ability." Building
   a genuine world-graph-level soft-lock check would need that pickup-location link added to
   generation first, which is a data-model change, not a QA-layer fix — flagging as a real
   follow-up rather than attempting a partial version that would just be confidently wrong.

10. **Added `validateWorldConnectivity()`** — a genuine, complementary check that fixes the part
    of item 9's gap that's actually tractable without a data-model change: pure graph
    connectivity of the *real* `worldGraph` (BFS over bidirectional room edges, ignoring ability
    requirements, since there's no pickup-location data to model those precisely — see item 9).
    This catches a real, distinct failure class the existing gates miss entirely: a bug in
    `buildEdges()` that leaves some room with no path back to the start at all. Confirmed the gap
    was real before fixing — `required_scenes_exist` only checks `roomCount >= 1`, and nothing
    else touched `worldGraph` for reachability at all (verified by grep). Wired in two places:
    the `world_topology` pipeline phase now fails if any room is disconnected (rather than always
    trivially passing once any scene file exists), and a new `world_connectivity` QA gate reads
    `world_graph.json` from disk so `metroforge validate` catches it standalone too. Required
    adding `@metroforge/procedural` as a dependency of `@metroforge/qa` (verified non-circular:
    `procedural` only depends on `schemas`/`shared`) plus the matching `tsconfig.json` project
    reference for the composite build. 4 new tests across both packages — including one that
    deliberately caught a mistake in my own first test assertion (severing one room's edges in a
    linear spine strands everything downstream of it too, not just that one room, which the test
    initially got wrong and the implementation got right). Live-verified against a real 90-room
    MEDIUM-profile world: both the pipeline phase and the standalone `validate` gate correctly
    report full connectivity.

11. **Added `asset_references_valid` QA gate.** Spec §33 explicitly calls out "missing
    textures/audio dependency checks" as part of static validation; the existing gate set had
    none. Scans every `.tscn` file under `scenes/` for `[ext_resource ... path="res://..."]`
    declarations (confirmed this is the actual, consistent pattern the assembler emits — every
    texture/script/sub-scene reference goes through `ext_resource`) and checks each resolved path
    exists in the project. Live-verified the full range of behavior against a real fixture
    project (`crystal-caverns-test`): passes cleanly as-is; deleting a real texture referenced by
    8 room scenes made the gate correctly report all 8 missing references and fail validation;
    `validate --repair` correctly declined to fabricate a texture it can't regenerate rather than
    silently "fixing" it with garbage (restored the file afterward — this fixture isn't tracked by
    git, `GeneratedGames/` is gitignored, but it's the user's local sample data, not disposable
    test scratch). Also live-verified no false positives on a fresh 90-room MEDIUM generation
    (8/8 gates passed). Scoped deliberately to static `ext_resource` declarations only —
    dynamically-constructed runtime paths (e.g. `WorldManager.gd`'s
    `"res://audio/music/%s.wav" % biome_id`) aren't checked, since Godot handles those missing at
    runtime gracefully rather than failing to import, which is a different and lower-severity
    failure mode than a broken static scene reference. 4 new tests.

12. **Closed item 9, and in doing so found a real gameplay-breaking bug, not just a validation
    gap.** Added the missing data link: each room's `metadata.grantsAbilities` now records which
    ability (if any) is picked up there, computed via a helper (`abilityGateRoomIndex`) shared
    with `buildEdges` so the pickup room and the gate it unlocks can never drift out of sync.
    Added `validateWorldReachability()` — a fixed-point progressive-unlock BFS over the *real*
    world graph (not the abstract chain), proving every room is reachable given abilities
    acquired in the order the layout actually allows.

    **While building the first test for "an unsolvable ability gate should be caught," the test
    failed in a way that revealed the gate was never actually working:** `buildEdges()` places
    each ability-gated edge between two rooms that are, by construction, immediately adjacent in
    the room sequence — and the main spine loop (or a vertical biome shaft) had *already* created
    a free, unconditional edge between that exact same pair. Confirmed directly by inspecting a
    real generated graph: `room_002 → room_003` had **two** edges, one requiring `dash`, one
    requiring nothing at all. Every ability gate this system has ever generated has been silently
    bypassable by walking the free duplicate — this affects actual generated games, not just QA
    reporting. Fixed in `buildEdges()`: when adding a gated edge, any pre-existing zero-requirement
    edge between that exact room pair is removed first, so the gate is the only way through.
    Confirmed the fix directly (re-inspected the same graph: exactly one edge now, correctly
    gated) and at scale — a 233-room/8-ability LARGE-profile world has zero gated edges with a
    surviving free duplicate, verified programmatically over the persisted `world_graph.json`.
    Wired both the data link and the new check into the `progression_graph` pipeline phase
    (alongside the existing abstract-chain check) and a new `world_reachability` QA gate.
    Live-verified 9/9 gates passing across TINY_TEST (8 rooms), MEDIUM (105 rooms), and LARGE
    (233 rooms). 4 new tests, including one that initially failed for the right reason and led
    directly to finding the real bug rather than being adjusted to match broken behavior.

Remaining:

Everything under "What is missing entirely" is legitimately P1/P2 breadth work per the spec's own
priority ordering (§61). All of the smaller, closer-to-the-vertical-slice gaps identified in the
original audit have now been closed, including the ability-gated world-graph reachability item.
One newer, smaller thread: dynamically-constructed runtime asset paths (audio, tileset textures
loaded by biome/room ID at runtime) aren't covered by the `asset_references_valid` gate — worth a
follow-up if silent audio/texture loading failures turn out to be a real problem in practice.
Also worth a look: the 233-room LARGE world above still had 7 duplicate room-pairs among
non-ability-gated edges (branching shortcuts happening to coincide with vertical shafts) — almost
certainly harmless (redundant edges, not incorrect ones) but not yet root-caused.
