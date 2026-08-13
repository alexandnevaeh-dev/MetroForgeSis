# MetroForge Audit Pass 2

**Date:** 2026-08-13  
**Branch:** `feature/claude-generation-runtime`  
**Repo:** MetroForge AI (`Forged`)  
**Prior:** [`METROFORGE_AUDIT_PASS_1.md`](./METROFORGE_AUDIT_PASS_1.md) · [`METROFORGE_FEATURE_STATUS.md`](./METROFORGE_FEATURE_STATUS.md)

---

## Scope

Continuation after Pass 1 productionization. Focused UI honesty + light archetype gating. No full redesign; no second image pipeline.

## Fixed this pass

### P1A — Export / Dashboard blockers clarity
- Shared `AssetProductionGatePanel` lists blocked visuals with **path + maturity + reason**
- Export + Dashboard no longer collapse blockers into a single “Not production ready” line
- Copy documents `project.json` `allowPlaceholders: true` for prototype opt-out (no Settings toggle yet)

### P1B — Generation Studio DEGRADED
- Timeline treats `DEGRADED` / `WARN` as completed-with-warning (progress + status class + banner)
- Phase messages (including `environment_assets DEGRADED…`) remain visible under each phase row
- CSS: `status-degraded` / `status-warn` use warning color

### P1C — Routing Inspector IMAGE path
- Inspector shows locality, health, score, reject reasons for image candidates
- `degradedFallback` banner when no healthy image provider
- Handler still merges `ImageProviderRegistry` + catalog; now also stubs unconfigured ComfyUI/NVIDIA and documents procedural PLACEHOLDER as non-routable last resort
- Does **not** invent a second image pipeline

### P1D — Editor archetype gating (light)
- `list-projects` exposes `archetype` from `game_dna.json` / `project.json`
- Dungeon Editor soft empty-state for side-view projects; top-down remains fully usable
- World/Room editors unchanged (no clear cheap wrong-archetype bugs)

### P1E — Live validation (inspection)
- Inspected existing GeneratedGames project `a-wind-swept-marsh-kingdom-with-a-hidden-crypt` (TOP_DOWN TINY_TEST):
  - 102 artifacts; **91** visuals blocked as PLACEHOLDER via `fallbackGenerated` / procedural provider
  - `allowPlaceholders=false` → `productionReady=false`, completionScore 57
  - Sample blocker: `assets/characters/player.png (PLACEHOLDER)`
- CLI `pnpm metroforge validate a-wind-swept-marsh-kingdom-with-a-hidden-crypt --no-runtime`: **Validation PASSED** (static gates + Godot headless import; runtime smoke also reported 13/13 in this run). Note: on-disk `validation_report` may still read FAILED until rewritten — completion analysis uses the file.
- Fresh TINY_TEST generation was **not** started this pass (avoid hang); existing project sufficient for maturity/gate evidence.

### P1F — Tests
- `progress.test.ts`: DEGRADED/WARN earn full phase weight
- `image-router.test.ts`: `explainImageProviderRouting` accept/reject + degradedFallback
- Desktop typecheck PASS

## Validation (commands)

| Command | Result |
|---|---|
| `pnpm exec vitest run` packages/assets + progress + project-completion | **12 files / 63 tests PASS** |
| Earlier targeted suite (shared maturity, AI catalog, QA validator, nvidia-image, …) | **7 files / 49 tests PASS** |
| `pnpm --filter @metroforge/desktop typecheck` | PASS |
| Live completion analysis on wind-swept marsh | `productionReady=false`, 91 PLACEHOLDER blockers |
| `pnpm metroforge validate … --no-runtime` | PASSED (Godot configured) |

## Remaining blockers

- Procedural PLACEHOLDER art remains default without healthy ComfyUI / Diffusers / NVIDIA image backends — **MetroForge is not production-complete**
- Older manifests lack `maturity` / `productionReady` fields (gate still infers PLACEHOLDER from `fallbackGenerated` / procedural provider)
- Settings still has no provider enable toggles or `allowPlaceholders` control (documented via Export/Dashboard copy only)
- Fresh generate TINY_TEST end-to-end not re-run this pass

## Next pass recommendation

1. With image providers healthy: regenerate TINY_TEST → confirm non-PLACEHOLDER maturity + Inspector selected provider + Studio DEGRADED absent when art is real
2. Optional: Settings toggle or project-meta editor for `allowPlaceholders`
3. Manifest maturity backfill tool for older GeneratedGames
4. Full `pnpm test` sweep if not already green on CI
