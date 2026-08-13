# MetroForge Audit Pass 5

**Date:** 2026-08-13  
**Branch:** `feature/claude-generation-runtime`  
**Repo:** MetroForge AI (`Forged`)  
**Prior:** [`METROFORGE_AUDIT_PASS_4.md`](./METROFORGE_AUDIT_PASS_4.md) · [`METROFORGE_FEATURE_STATUS.md`](./METROFORGE_FEATURE_STATUS.md)

---

## Scope

Pass 5 polish after provider toggles: Export preflight image health line, clearer Models catalog status labels, FEATURE_STATUS refresh, targeted tests + desktop typecheck. No long generation. No commit.

## Fixed this pass

### Export — image provider health summary
- Export Preflight reads `getConfig().imageProviders` probe results
- Shows one line: `Image provider health: <id>=<STATUS> · …`

### Models — AVAILABLE / ROUTABLE / BLOCKED
- Table + inspector use compact status derived from `routable` / `providerEnabled` / `liveListed` / `enabled`
- Description clarifies meanings

### Docs
- This file + Pass 4 audit + FEATURE_STATUS matrix bumped to Pass 5

## Validation

Recorded in the shipping agent final report (targeted vitest + desktop typecheck).

## Remaining blockers

- Same as Pass 4: real image generation + remapping unknown abilities still required for production-ready sample projects
- ComfyUI / Diffusers health still environment-dependent

## Next

1. Set `NVIDIA_IMAGE_MODEL` to a listed NIM image id (or bring Comfy up) → regenerate TINY_TEST for non-PLACEHOLDER art
2. Remap sample `wind_disc` (etc.) to registered ability ids in `game_dna.json`
3. Full `pnpm test` sweep if CI not already green
