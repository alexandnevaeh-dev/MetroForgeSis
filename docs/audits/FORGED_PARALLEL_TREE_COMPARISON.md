# Forged Parallel Tree Comparison

Date: 2026-08-19

## Decision

`E:\Projects\MetroForge\Forged` is the canonical MetroForge development repository. It is the only Git-backed tree, currently on `feature/claude-generation-runtime` at `aae921d`. `E:\Projects\MetroForge\Forged-cursor-desktop` is preserved and was inspected only for comparison. No files were copied from it.

The comparison was source-oriented and excluded dependency directories, built output, generated game output, and Git metadata. The canonical tree contains approximately 618 matching-scope source/config files versus 195 in the sibling tree.

## Classification Summary

| Difference | Classification | Recommendation |
|---|---|---|
| Canonical-only AI routing, provider health, licensing, speech, model scouting, and project-memory modules | Canonical version newer | Keep canonical implementation; do not salvage sibling code |
| Canonical-only asset foundry, provenance, compilers, NVIDIA image/VLM, animation QA, sprite QA, and identity packs | Canonical version newer | Keep; these are part of the current asset/reliability path |
| Canonical-only expanded QA, validation levels, gameplay capture, quality director, presentation gates, and repair modules | Canonical version newer | Keep; use as the reliability gate foundation |
| Canonical-only desktop queue/edit-history/readiness/visual review modules | Canonical version newer | Keep; verify through current build rather than copying sibling UI |
| `Forged-cursor-desktop/config/models.default.json` | Sibling-only configuration, likely obsolete | Do not copy; compare against canonical `config/models.catalog.json` before any future migration |
| `Forged-cursor-desktop/templates/godot-metroidvania/scripts/core/AssetSprite.gd` | Sibling-only runtime file | Likely obsolete or superseded by canonical asset runtime; inspect only if a canonical template regression is found |
| `Forged-cursor-desktop/templates/godot-metroidvania/scripts/world/AbilityGate.gd` | Sibling-only runtime file | Uncertain; canonical template has ability-gate behavior elsewhere; do not copy without a failing canonical fixture |
| Canonical `.metroforge`, model caches, reports, and generated artifacts | Generated artifact/configuration difference | Never port; keep isolated from source and review `.gitignore`/storage policy |
| Canonical `apps/desktop/dist-electron` declarations and sibling absence | Generated build artifact | Do not version or port; regenerate from canonical source |

## Canonical-Only Source Families

The canonical tree adds, among other files:

- `packages/assets/src/foundry/*`
- `packages/assets/src/identity/*`
- `packages/assets/src/providers/{automatic1111,deepai,huggingface-image,kenney,opengameart,replicate,stability,nvidia-*}.ts`
- `packages/assets/src/{animation-critic,animation-manifest,asset-normalizer,image-conditioning,parallax-strip,prop-art,sprite-qa,tile-roles,ui-foundry,vision-critic-*}.ts`
- `packages/ai/src/{catalog-reconciliation,export-license-audit,license-router,mode-routing,project-memory,provider-health-monitor,provider-license-metadata,speech-model-download}.ts`
- `packages/ai/src/providers/{ollama-embeddings,piper-tts,whisper-asr}.ts`
- `packages/database/src/repositories/{artifact,settings,validation-result}.ts`
- `packages/generation/src/{artifact-lineage,asset-coverage,asset-history,backfill-asset-maturity,dependency-graph,derivative-license,dialogue-voice}.ts`
- `packages/qa/src/{acceptance-report,gameplay-capture,playtest-output,presentation-gates,quality-director,quality-repair-engine,quality-scoring,validation-level,visual-quality}.ts`
- desktop generation queue, edit history, readiness, asset production gate, and visual review modules

These differences are objective evidence that the canonical tree is newer and more complete, not merely a renamed copy.

## Package Differences

Both trees retain the same broad workspace package names (`ai`, `assets`, `core`, `database`, `generation`, `godot`, `procedural`, `qa`, `schemas`, `shared`, `tools`) and `apps/cli`/`apps/desktop`. No package exists only in the sibling tree. The meaningful divergence is inside packages and templates, not workspace topology.

## Configuration Differences

The canonical root has current `config/models.catalog.json`, `config/providers.default.json`, `.metroforge` user state, and expanded environment/config support. The sibling has `config/models.default.json`, which is not the canonical catalog contract and should be treated as obsolete/uncertain. The canonical tree also contains generated reports and local model metadata that must remain outside source comparisons.

## Functionality That Might Need Future Salvage

1. The sibling `AssetSprite.gd` and `AbilityGate.gd` should only be considered salvage candidates if a canonical generated fixture demonstrates a missing runtime behavior that those exact files solve.
2. The sibling model-default configuration should not be salvaged; reconcile model metadata through the canonical catalog service instead.
3. Any visual/UI differences should be evaluated through screenshots and tests, not copied based on file presence. The canonical tree already has newer readiness and visual-review surfaces.

## Recommendation

Continue development only in `Forged`. Keep `Forged-cursor-desktop` read-only and preserved. Resolve future differences by Git history and focused tests. Do not automatically synchronize the trees, copy files, or use the sibling as a fallback implementation source.
