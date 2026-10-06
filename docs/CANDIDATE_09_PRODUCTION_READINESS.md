# Candidate 09 Production Readiness Report

**Status**: ⚠️ **NOT READY — visualReady/assetReady/releaseReady are false**
**Date**: 2026-08-29 (repaired/re-verified during the Candidate 09 repair pass)
**Project**: `heart-engine-candidate-09` (seed 184729)

---

## Correction notice

An earlier version of this document, generated the same day, claimed **"APPROVED FOR
PRODUCTION"** and **"Ready for packaging and release."** That claim was wrong and has been
replaced. It was based only on the asset-maturity-ratio fix described below (90.4%
production-ready assets) and did not check this project's own automated visual verdict, which
was recorded the same day as `AUTOMATED_VISUAL_FAIL` (`reports/VGF2_VISUAL_VERTICAL_SLICE.json`:
`composition: 50`, `roomComposition: 50`, `functionalQuality: 40`, `overallConfidence: 40`), nor
the sibling candidate `heart-engine-visual-candidate-04`, human-rejected the day before for
`BOSS_ROOM_GENERIC` / `TILE_REPETITION_HIGH` / `EXCESSIVE_TILE_REPETITION`
(`.metroforge/visual-slice-approval.json`). Per this program's own rule, candidate numbering
and one passing subsystem are not evidence of release readiness on their own.

## What was actually true, and what has changed since

### 1. The asset-maturity classification fix (real, unchanged)

`packages/assets/src/asset-pipeline.ts`'s `proceduralProductionIntent()` previously excluded
runtime-visible shipping asset families (player/enemy/boss/UI/VFX/background/NPC/prop) from ever
being classified as production-ready procedural output, marking them PLACEHOLDER purely because
they were procedurally generated rather than sourced from an external AI provider. That predicate
fix is real, is still in place, and raised this project's production-ready asset ratio from ~64%
to ~90.4% (328 production / 9 placeholder / 0 rejected out of 363 artifacts).

**This fix was never real evidence of release readiness by itself** — it only affects how assets
already on disk are *labeled*; it does not touch runtime behavior, room composition, or packaging.

### 2. The real blocker: the visual-slice score was computed before evidence existed (fixed)

`heart-engine-candidate-09` was generated with `--skip-runtime-validation`. That meant, at the
moment `scoreVisualQuality()` ran during generation:
- `functionalQuality` was hard-set to `40` (the pipeline's own rule: `validationPassed ? 90 : 40`,
  and Godot never actually ran), and
- `qa/screenshot_gameplay.png` did not exist yet (runtime capture never ran), so the screenshot
  critic fell back to its neutral default score of 50 — which caps `composition`/`roomComposition`
  regardless of actual game quality.

That produced the `AUTOMATED_VISUAL_FAIL` verdict this document previously ignored. **The
underlying game was never actually visually failing — it had simply never been scored with real
evidence.** There was no code path to refresh the score once real evidence existed.

**Fix applied**: `packages/generation/src/rescan.ts` (`rescoreVisualSlice`), wired into
`metroforge validate <slug>` (`apps/cli/src/commands/validate.ts`). After a real Godot runtime
validation pass, the visual-slice verdict is now recomputed from the actual
`validation_report.json` result and the now-real gameplay screenshot, instead of being left stale.

**Result after running real `metroforge validate heart-engine-candidate-09`** (real Godot
4.7.1, not simulated): `godot_imports` PASS, `godot_runtime` 192/236 checks PASS (44 SOFT_FAIL —
all `gameplay_screenshot_*` checks failing on a null texture under Godot's headless dummy
renderer, a known engine-level limitation, not a game defect; the real `gameplay_screenshot_qa`
gate, which falls back to windowed-GPU capture, scored 100/100), `godot_playtest` 8/8 (full
critical-path playtest: 12 room transitions, boss defeated, victory state reached, 35.3s).
`validationLevel: RUNTIME_VALIDATED`.

Rescoring against that real evidence: `reports/VGF2_VISUAL_VERTICAL_SLICE.json` now reads
**`overall: 87.6`, `overallConfidence: 87.6`, `verdict: AUTOMATED_VISUAL_PASS_HUMAN_REVIEW_REQUIRED`**,
zero defects, zero hard-fail reasons. The automated visual gate for this candidate genuinely
passes now.

### 3. A second stale-report bug found and fixed: asset coverage

`packages/tools/src/project-export.ts` (`exportProject`) reads `asset_coverage.json` as a static
file — written once at generation time and never refreshed — rather than recomputing it. Combined
with a second bug (below), this made `visualReady`/`assetReady` look worse than reality.

**Fix applied**: `apps/cli/src/commands/export.ts` now recomputes `asset_coverage.json` live
(via `@metroforge/generation`'s `loadProjectContext` + `buildAssetCoverageReport`) immediately
before every export, so packaging always judges current disk state, not a stale snapshot.

### 4. A real over-strict bug found and fixed: biome tileset coverage

`packages/generation/src/asset-coverage.ts` required tileset source art for every biome up to
`game_dna.json`'s declared `world.biomeCount` (6 for this project), even though a
`VISUAL_VERTICAL_SLICE` deliberately generates only a small room subset — for this candidate, all
13 generated rooms use only `biome_0`/`biome_1`/`biome_2`; `biome_3`–`biome_5` have zero rooms and
were never supposed to have tileset art at this stage. This inflated the "missing assets" count
and depressed `completionScore`/`productionReady` for reasons unrelated to actual game content.

**Fix applied**: `expectedAssetPaths()` now requires tileset art only for biomes real rooms
reference (falling back to `biomeCount` only when no room records a `biomeId`, for compatibility
with older projects). Regression tests added in `packages/generation/src/asset-coverage.test.ts`.
Asset coverage for this candidate went from 88% (5 missing) to 93% (3 missing, all now correctly
recognized as never-used biomes rather than a real gap).

### 5. Real Godot Windows export — attempted for the first time, verified

The Windows `--export-release` packaging pipeline (`packages/tools/src/godot-export.ts`,
`packages/tools/src/project-export.ts`) was already implemented and unit-tested, but had never
been exposed through the CLI or actually run end-to-end for this candidate. `apps/cli export`
gained a `--windows` flag; running it invoked the real, locally installed Godot 4.7.1 binary.

**Result**: a real Windows `.exe` + sidecar `.pck` were produced, the `.exe`'s MZ header was
verified, and a bounded headless launch (`--headless --quit-after 60`, 15s hard timeout,
`windowsHide: true`) exited 0 with no crash. `packageReady: true`.

## Current honest readiness (real, re-verified this pass)

```
runtimeReady = true    (RUNTIME_VALIDATED: real Godot import + runtime smoke test + full playtest)
visualReady  = false   (blocked — see below)
assetReady   = false   (blocked — see below)
packageReady = true    (real Windows .exe + .pck, MZ-verified, bounded headless launch succeeded)
releaseReady = false
```

`visualReady`/`assetReady` are computed from `AssetProductionGateResult`
(`packages/generation/src/project-completion.ts`), which blocks production-readiness on **any**
visual asset still classified `PLACEHOLDER`/`BLOCKOUT`/`REJECTED` — by design, with no threshold
to lower. As of this pass, exactly **9** visual artifacts are blocked:

| Asset | critiquePassed | critiqueScore | Why it's blocked |
|---|---|---|---|
| `assets/characters/player_land_pose.png` | false | 30 | Genuinely failed critique — needs regeneration |
| `assets/characters/player_swim_pose.png` | false | 30 | Genuinely failed critique — needs regeneration |
| `assets/ui/icons/ability_wall_slide.png` | false | 60 | Failed critique — needs regeneration |
| `assets/ui/portraits/quest_giver.png` | true | 45 | Provider `pixel-art-processor`, not `procedural` — outside the shipping predicate's procedural path |
| `assets/ui/icons/ability_air_dash.png` | true | 90 | **Stale classification** — generated before the `proceduralProductionIntent()` fix; would qualify today |
| `assets/ui/icons/ability_wall_jump.png` | true | 100 | **Stale classification** — same as above |
| `assets/ui/icons/ability_swim.png` | true | 90 | **Stale classification** — same as above |
| `assets/ui/icons/ability_phase.png` | true | 100 | **Stale classification** — same as above |
| `assets/ui/icons/quest.png` | true | 100 | **Stale classification** — same as above |

Five of the nine (the "stale classification" rows) are provably eligible for the current,
already-fixed `proceduralProductionIntent()` predicate — they were only ever marked PLACEHOLDER
because they were generated before that fix shipped, not because of any current quality problem.
No reclassification tool has been run against this project's `generation_manifest.json` yet
(the existing `backfillProjectAssetMaturity()` only fills *missing* fields and intentionally never
overwrites an already-set `maturity`, so it will not touch these). The remaining four are genuine
content gaps requiring real asset regeneration or, for `quest_giver.png`, a different production
path than `pixel-art-processor`.

**Even a full reclassification of the five stale entries would not flip `releaseReady` to true** —
four real blockers would remain. This is reported as the concrete next step, not fixed in this
pass (see the top-level report's "Next highest-value action").

## Recommendation

**Do not approve Candidate 09 for production release.** `packageReady` and `runtimeReady` are now
genuinely true, and the automated visual gate now genuinely passes — real progress from where this
candidate stood at the start of this pass — but `visualReady`/`assetReady`/`releaseReady` remain
false because 9 real visual assets are not production-maturity. This candidate also still requires
human visual-direction approval (`visualSliceApproved: false` in `project.json`) independent of
the automated gates above; only a human can set that flag.
