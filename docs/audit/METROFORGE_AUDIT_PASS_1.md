# MetroForge Audit Pass 1

**Date:** 2026-08-13  
**Branch:** `feature/claude-generation-runtime`  
**Repo:** MetroForge AI (`Forged`)  
**Companion matrix:** [`METROFORGE_FEATURE_STATUS.md`](./METROFORGE_FEATURE_STATUS.md)  
**Prior evidence:** `docs/METROFORGE_CURRENT_BUILD.md`, `docs/IMPLEMENTATION_STATUS.md`

---

## EXECUTIVE SUMMARY

MetroForge is a real monorepo generation platform (CLI + Electron desktop → generation/assets/godot/qa packages), **not** a UI mock. This pass focused on productionization correctness: archetype-aware QA, asset maturity + production gating, honest DEGRADED asset fallbacks, image routing explainability, and NVIDIA image health reasons.

**Verdict:** Generation/QA core is **usable and largely WORKING** for scoped profiles, but **not production-complete**. Procedural art remains common without local/hosted image backends; `productionReady` must stay false unless the project explicitly allows placeholders or real image providers succeed. Do not claim ship-ready games from placeholder textures alone.

---

## Systems working

- Text generation routing via `GenerationRouter` → `CapabilityRouter` / `FallbackManager`
- Deterministic Game DNA / world / content / design bible fallbacks
- Godot project assembly from templates (side-view + top-down plugins)
- QA static gates + repair engineer (subset of gates)
- Desktop IPC → real packages (no mock provider list)
- Model catalog + hardware ranking; **remote models no longer VRAM-gated**
- Concurrency pool status exposes both `max` and `limit`
- Asset maturity types + `AssetProductionGate` in project completion
- Image provider registry with degraded procedural fallback metadata

## Systems partial

- Image generation quality (ComfyUI / Diffusers / NVIDIA optional; procedural default)
- World / Room / Dungeon editors (wired, archetype UX uneven)
- Game Preview (Godot path / runtime dependent)
- NVIDIA providers without API key → MISCONFIGURED / unavailable (honest)
- Vision/VLM critique (skips blank headless frames)
- Export `productionReady` (now correctly blocked by placeholder maturity)
- Routing Inspector for IMAGE_GENERATION (fixed to merge image providers + catalog)

## Systems broken

- None newly confirmed as hard-broken after the top-down `required_files` / PlayerController fix.
- Historical false QA failure (top-down missing `PlayerController.gd`) was a **correctness bug**; fixed via `resolveGameArchetype` + regression test.

## Systems placeholder / missing

- Named “Asset Foundry” / CharacterVisualDNA / SpriteCompiler class architecture: **MISSING** (AssetPipeline covers real work under different names)
- Full commercial asset pipeline to PRODUCTION_READY without human review: **not claimed**
- Provider enable/disable toggles in Settings: **MISSING**

---

## High-risk issues

1. **Silent “success” on procedural art** — mitigated this pass: environment_assets reports `DEGRADED`; maturity PLACEHOLDER; production gate blocks.
2. **Archetype mismatch in QA/repair** — mitigated: top-down requires `TopDownPlayerController.gd`.
3. **Routing Inspector empty IMAGE candidates** — mitigated: desktop handler merges `ImageProviderRegistry` explain + catalog image models.
4. **VRAM filter rejecting remote NVIDIA** — mitigated: filter applies only when `m.local === true`.
5. **Top-down template deletions** (`AbilityController.gd`, `AbilityRegistry.gd`, `PlayerAbility.gd`, `PlayerController.gd` under `templates/godot-topdown-adventure`) — **left as-is**; appear intentional for top-down (side-view controller must not be required). Restore only if tests prove accidental.

---

## Godot / AI routing / asset / world / QA issues

| Area | Finding |
|---|---|
| Godot | Assembler + templates real; runtime validation not re-executed this continuation |
| AI routing | Text WORKING; image separate registry by design; Inspector now explains both |
| Assets | Maturity ladder + provenance fields on GeneratedAsset / optional ArtifactSchema fields |
| World | Procedural topology WORKING; editors PARTIAL |
| QA | Top-down required_files regression covered; production gate in completion analysis |

---

## Repairs completed (this productionization pass)

- Concurrency `getStatus()` → `max` + `limit`; UI `max ?? limit`
- QA `readProjectArchetype` → `resolveGameArchetype()`
- Top-down `required_files` regression test
- `AssetMaturity` in `@metroforge/shared` + schema optional fields
- `evaluateAssetProductionGate` / completion checklist
- Pipeline `environment_assets` → `DEGRADED` when placeholders
- Image router fallbackDepth / fallbackReason / health reports
- NVIDIA image health: HEALTHY \| DEGRADED \| UNAVAILABLE \| AUTH_FAILED \| RATE_LIMITED \| MISCONFIGURED \| UNKNOWN
- Providers UI shows status + reason
- Routing Inspector IMAGE path merges image providers
- Asset Gallery detail shows maturity when metadata exists
- Remote-vs-local VRAM tests

---

## Tests added

- `packages/qa/src/validator.test.ts` — top-down TopDownPlayerController required_files
- `packages/shared/src/asset-maturity.test.ts`
- `packages/generation/src/project-completion.test.ts` — placeholder production gate
- `packages/ai/src/model-catalog.test.ts` — remote VRAM not rejected
- `packages/assets/src/providers/nvidia-image.test.ts` — health statuses
- `packages/assets/src/image-router.test.ts` — degraded fallback depth

*(Results recorded in the Validation section after test run.)*

---

## Remaining work

- Live Godot `--runtime` / playtest on a fresh TINY_TEST with and without image providers
- Backfill maturity onto old `generation_manifest.json` artifacts
- Archetype-gated editor UX (hide dungeon for side-view or explain)
- Provider enable toggles; catalog entry for NVIDIA image model id
- Promote assets to PRODUCTION_READY only after explicit QA_REVIEW policy
- Confirm top-down template ability script deletions are intentional across Claude workstream docs

---

## Next priorities

1. **P1:** With healthy image providers, regenerate TINY_TEST and confirm non-PLACEHOLDER maturity + Routing Inspector selection  
2. **P2:** Settings provider toggles + optional `allowPlaceholders` project control  
3. **P2:** Manifest maturity backfill for older GeneratedGames  
4. **P2:** Full `pnpm test` CI sweep

---

## Validation

Executed 2026-08-13 (this continuation), from repo root:

| Command | Result |
|---|---|
| `pnpm --filter @metroforge/shared build` | PASS |
| `pnpm --filter @metroforge/assets build` | PASS (after wrapping checkpoint return with `withMaturity`) |
| `pnpm exec vitest run` on shared maturity, AI model-catalog, generation project-completion, assets package, qa validator | **14 files / 83 tests PASS** |
| `pnpm --filter @metroforge/desktop typecheck` | PASS |

Note: `pnpm --filter <pkg> exec vitest run src/...` fails because root `vitest.config.ts` includes only `packages/**/*.test.ts` relative to the monorepo root — use root `pnpm exec vitest run packages/...` instead.

Godot live `--runtime` validation was **not** re-run in this continuation.

---

## Pass 2 appendix (2026-08-13 continuation)

See full write-up: [`METROFORGE_AUDIT_PASS_2.md`](./METROFORGE_AUDIT_PASS_2.md).

- Export/Dashboard: AssetProductionGate path+maturity lists + allowPlaceholders copy  
- Generation Studio: DEGRADED = completed-with-warning  
- Routing Inspector IMAGE: locality/health columns + unconfigured provider stubs  
- Dungeon Editor: side-view soft-gate  
- Live: wind-swept marsh → 91 PLACEHOLDER blockers, `productionReady=false`; CLI validate PASSED with Godot present  
