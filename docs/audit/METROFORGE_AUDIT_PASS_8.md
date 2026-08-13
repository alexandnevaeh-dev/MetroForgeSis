# MetroForge Audit Pass 8

**Date:** 2026-08-13  
**Branch:** `feature/claude-generation-runtime`  
**Repo:** MetroForge AI (`Forged`)  
**Prior:** [`METROFORGE_AUDIT_PASS_7.md`](./METROFORGE_AUDIT_PASS_7.md) · [`METROFORGE_FEATURE_STATUS.md`](./METROFORGE_FEATURE_STATUS.md)

---

## Scope

Pass 8: rewrite stale `wind_disc` (and other ability-alias) strings in item/quest/world JSON after ability remap; surface NVIDIA DEGRADED nearby-model suggestions in Settings/Providers; targeted validation sweep. No architecture rewrite. No long generation. No commit.

## Fixed this pass

### Ability reference remap
- `@metroforge/shared`: `remapAbilityReferenceToken` + `remapAbilityReferences` (deep JSON walk; exact ids + `item_<alias>` forms → registered targets, e.g. `wind_disc` → `dash`, `item_wind_disc` → `item_dash`)
- `@metroforge/generation`: `remapProjectAbilityReferences` applied by `remapProjectAbilities` (same IPC/CLI path) on:
  - `world_graph.json`, `progression_graph.json`
  - `data/world/world_graph.json`, `data/world/overworld.json`
  - `data/items/items.json` (dedupes duplicate ids after remap)
  - `data/quests/*.json` when present
- Marsh sample JSON rewards/gates remapped; only historical `validation_report.json` still mentions `wind_disc`
- Unit tests: shared reference remap + generation project ref rewrite

### NVIDIA model suggestion UX
- Health probe now returns structured `nearbyModels` / `suggestedModelIds` on DEGRADED (missing configured model)
- Fields pass through `probeImageProviders` → `get-config` `imageProviders`
- Settings: clickable nearby ids fill `app.nvidia.imageModel` (save still required)
- Providers: Use model / Copy buttons set `app.nvidia.imageModel` via `setAppSettings`

## Validation

- Vitest: ability-remap, remap-project-abilities, nvidia-image, plus related shared/generation/assets/ai/qa subset
- Desktop + CLI typecheck

## Remaining / honest blockers

- Still not production-complete without real non-PLACEHOLDER image generation (listed NIM model or healthy Comfy)
- Marsh `validation_report.json` and some `.gd` template fallbacks may still say `wind_disc` (not reward JSON)
- Live NVIDIA HEALTHY depends on picking a listed image model id from suggestions

## Next pass recommendation

Wire a one-click “apply suggested NIM model + re-probe” that also refreshes export/dashboard image health, and optionally scrub generated `.gd` string literals — only after a live image generate succeeds with a listed model.
