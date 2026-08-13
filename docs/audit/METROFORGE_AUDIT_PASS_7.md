# MetroForge Audit Pass 7

**Date:** 2026-08-13  
**Branch:** `feature/claude-generation-runtime`  
**Repo:** MetroForge AI (`Forged`)  
**Prior:** [`METROFORGE_AUDIT_PASS_6.md`](./METROFORGE_AUDIT_PASS_6.md) · [`METROFORGE_FEATURE_STATUS.md`](./METROFORGE_FEATURE_STATUS.md)

---

## Scope

Pass 7: apply ability remap to the marsh sample, auto-remap after Game DNA in the generation pipeline, CLI remap + NVIDIA image model config, docs + targeted tests. No long generation. No commit.

## Fixed this pass

### Marsh sample
- `GeneratedGames/a-wind-swept-marsh-kingdom-with-a-hidden-crypt/game_dna.json`: `wind_disc` → `dash`
- Synced `data/abilities/abilities.json` to registered `dash`

### Pipeline auto-remap
- After DNA generate/resume, `remapGameDnaAbilities()` normalizes ability ids before design bible / downstream phases
- Checkpoint rewritten when remaps/removals occur; warnings recorded

### CLI
- `metroforge project remap-abilities <slug> [--dry-run]`
- `metroforge config nvidia-image-model [modelId]` — get/set `NVIDIA_IMAGE_MODEL` in repo `.env`

### Remap helper
- `remapGameDnaAbilities` exported for in-memory use
- `remapProjectAbilities` also syncs `data/abilities/abilities.json` when present

## Validation

Targeted vitest for ability-remap + remap-project-abilities (+ desktop/CLI typecheck if run).

## Remaining

- Item ids / world reward refs may still say `wind_disc` (item progression ≠ runtime ability)
- Live NIM image still needs a listed `NVIDIA_IMAGE_MODEL` (or healthy Comfy)
- Full `pnpm test` sweep optional
