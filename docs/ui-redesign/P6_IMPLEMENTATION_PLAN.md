# MetroForge P6 — Implementation Plan (Audit)

**Date:** 2026-08-15  
**Constraint:** No UI redesign. No P1–P5 architecture replacement. No faked generation, playtests, providers, assets, Godot, or QA.  
**Goal:** Truth-seeking RELEASE_CANDIDATE E2E — generate, repair, validate, export, launch a real playable Godot game.

---

## STEP 0 — What already exists vs gaps

This is an honest gap table against the P6 spec (P6A–P6AZ / P6AS blockers). Status keys:

- **PRESENT** — implemented and used by the live pipeline
- **PARTIAL** — real code exists but missing a contract P6 requires
- **MISSING** — not implemented

### Profiles / DNA / bibles

| Spec | Status | Notes |
|------|--------|-------|
| P6A `RELEASE_CANDIDATE` profile | **MISSING** | `GenerationProfile` is only `TINY_TEST \| SMALL \| MEDIUM \| LARGE` (`packages/shared/src/constants.ts`, Zod enum, CLI, `generation-options.ts`, `CreateScreen` list). |
| Suggested RC scale (5–7 regions, 35–60 rooms) | **MISSING** | `PROFILE_DEFAULTS` has no RC row. Closest live fit is SMALL (3 biomes, 30–50 rooms) or MEDIUM (5 biomes, 80–120 rooms — too large). |
| P6D Game DNA persist + consume | **PRESENT** | `game_dna.json` checkpointed; downstream uses it. Resume via `--resume`. |
| P6E Design bible | **PARTIAL** | `design_bible.json` has art + audio only — not a full creative spec covering movement/combat/quests. Downstream art prompts *do* consume `ArtBible`. |
| P6Q StyleBible artifact | **PARTIAL** | `ArtBible` already has palette, lighting, promptPrefixes, negativePrompts, character/env/UI guidelines. No standalone `style_bible.json` consumed as such. |

### World / abilities / progression

| Spec | Status | Notes |
|------|--------|-------|
| P6F interconnected world | **PRESENT** | `generateWorldTopology` builds spine + shortcuts + biome shafts + ability gates. Not a pure linear chain for medium+ room counts. |
| P6H ability registry | **PRESENT** | `REGISTERED_ABILITIES` + remap (`wind_disc` → `dash`). QA gate `registered_abilities_valid` fails unknown IDs. |
| RC DNA uses registered IDs matching prompt (air_dash, wall_*, swim, phase/grapple) | **MISSING** | `pickRegisteredAbilities` slices prefix of the list. MEDIUM first-6 **omits swim/phase/grapple**. RC would currently inherit that prefix unless specialized. |
| Fail if unknown required ability remains | **PARTIAL** | Remap *removes* unknowns (warning) rather than failing the DNA phase. QA later fails. P6 wants fail-early if a required ability is still unknown. |
| P6G progression solver + persisted proof | **PARTIAL** | `validateReachability` + `validateWorldReachability` + `validateMovementFeasibility` exist and run. **No `progression_proof.json` trace** of room visits / ability unlocks. |
| P6I runtime ability implementations | **PRESENT** | Template `AbilityRegistry.gd` + handler scripts for all 9 registered IDs. Do not rewrite. |

### Pipeline / QA / Godot / playtest

| Spec | Status | Notes |
|------|--------|-------|
| `GENERATION_PHASES` vs `report()` | **PRESENT** | 16 phases match pipeline `report()` calls. Studio imports shared list. |
| Phase COMPLETE = persist + validate | **PARTIAL** | Phases report `PASSED` after work; most write JSON, but there is no shared artifact-complete check. `success: true` is distinct from `validationPassed`. |
| Resume / cancel | **PRESENT** | DNA checkpoint resume; `AbortSignal` + `GenerationCancelledError`. Do not regress. |
| Bounded repair max 3 | **PRESENT** | `MAX_REPAIR_ATTEMPTS = 3`. |
| P6AI checkpoints before assembly/repair/export | **PARTIAL** | `createProjectCheckpoint` exists (IPC + tests). Pipeline does **not** auto-checkpoint those milestones. Asset checkpoints on resume exist. |
| P6Z/P6AA Godot canonical resolver | **PARTIAL** | P5 resolver is real. Pipeline still prefers `config.godotExecutable ?? detectAll()`, not `resolveGodotExecutableCanonical`. |
| Headless import + runtime smoke | **PRESENT** | `validateGodotHeadless` + `validateGodotRuntime` when Godot available. |
| P6AB/AC/AD playtest | **PARTIAL** | `PlaytestAgent.gd` does real input simulation. Personas: `victory_rusher`, `ability_collector`. **No `critical_path` / `CRITICAL_PATH`**. Telemetry JSON exists. |
| P6AE gameplay screenshots REQUIRED for RC | **MISSING** | `validateGameplayScreenshot` **passes SKIPPED** when file missing (`passed: true`). Tiny profiles may stay optional; RC must fail. |
| P6T/U fallback DEGRADED + license | **PRESENT** | `environment_assets` reports `DEGRADED` on placeholders. License fields via `licenseFieldsForProvider`. |
| P6AJ Studio timeline | **PRESENT** | Existing phases; do not redesign UI. Only add `RELEASE_CANDIDATE` to the profile dropdown so it is selectable. |
| Export | **PRESENT** | `exportProject` + manifest. |

### Tests / E2E

| Spec | Status | Notes |
|------|--------|-------|
| Integration tests for RC profile, ability registry, progression proof, playtest telemetry, COMPLETE contract | **MISSING** for RC/proof/COMPLETE | Registry + telemetry parse tests already exist. |
| Real RC E2E run | **MISSING** | Must run after wiring. Do not substitute TINY_TEST as official RC. |

---

## What P6 will implement (prioritized)

1. **`RELEASE_CANDIDATE` profile** across type/union/defaults/schemas/CLI/CreateScreen list. Scale: 6 biomes, 38–52 rooms, 5 registered traversal abilities, 10 enemies, 4 bosses, 5 NPCs, 4 quests. Seed **184729**. Mode **HYBRID_FREE**. Archetype **SIDE_VIEW_METROIDVANIA**. Hardware **LOW_RESOURCE** (NVIDIA hosted image).
2. **DNA ability pick** for RC: `air_dash`, `wall_slide`, `wall_jump`, `swim`, `phase` (unusual world-interaction). Fail validation if any required ID is unknown after remap.
3. **Progression proof** JSON: start reachable, each ability acquirable, no self-lock, critical path, boss reachable, visit/unlock trace. Movement feasibility included.
4. **Playtest:** add `critical_path` persona (maps `CRITICAL_PATH` / `VICTORY_RUSHER` aliases). Default RC persona = `critical_path`. Keep real input sim; no victory cheats. Emit `playtest_telemetry.json` + `playtest/telemetry.jsonl`.
5. **Screenshot gate:** RC missing/blank screenshot → **FAIL**. Other profiles keep SKIPPED.
6. **Phase complete helper** + cheap checkpoints before assembly / repair / export. Canonical Godot resolver in pipeline. Style bible artifact derived from ArtBible and consumed by asset prompts.
7. **Targeted vitest** + real CLI `metroforge create --profile RELEASE_CANDIDATE`.
8. **Reports:** `reports/p6-release-candidate.{json,md}`, `docs/ui-redesign/P6_IMPLEMENTATION_REPORT.md`. Honest PASS / PASS WITH WARNINGS / FAIL.

## Explicitly out of scope

- UI redesign, new screens, fake fill states.
- Replacing ability runtime with a new architecture.
- Weakening QA gates, inventing rooms, stubbing NVIDIA, or marking missing screenshots as PASS.
- Substituting TINY_TEST as the official RC result.

## E2E run plan

Prefer CLI (not Electron) to avoid hang:

```
metroforge create --prompt "<Heart Engine prompt>" --profile RELEASE_CANDIDATE --mode HYBRID_FREE --seed 184729 --archetype SIDE_VIEW_METROIDVANIA --hardware-profile LOW_RESOURCE
```

If NVIDIA image gen cannot finish 38–52 rooms of tilesets/sprites in one session: document the last real phase, keep status **RELEASE CANDIDATE FAIL**, do not call a TINY_TEST run the RC result.
