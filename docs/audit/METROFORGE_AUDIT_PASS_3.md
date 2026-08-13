# MetroForge Audit Pass 3

**Date:** 2026-08-13  
**Branch:** `feature/claude-generation-runtime`  
**Repo:** MetroForge AI (`Forged`)  
**Prior:** [`METROFORGE_AUDIT_PASS_2.md`](./METROFORGE_AUDIT_PASS_2.md) · [`METROFORGE_FEATURE_STATUS.md`](./METROFORGE_FEATURE_STATUS.md)

---

## Scope

Pass 3 focused on project `allowPlaceholders` control + manifest maturity backfill. No full UI redesign; no second image pipeline; no commit.

## Fixed this pass

### P1 — Settings / project `allowPlaceholders` control
- `setProjectAllowPlaceholders` / `getProjectAllowPlaceholders` write/read top-level `allowPlaceholders` on `project.json`
- Electron IPC: `get-project-allow-placeholders`, `set-project-allow-placeholders`
- UI: `AllowPlaceholdersControl` on **Settings** (Active project), **Export** (Prototype gate), and **Dashboard** (near AssetProductionGate)
- `AssetProductionGatePanel` copy now points at Settings/Export toggle (not only manual JSON edits)
- When enabled, `evaluateAssetProductionGate` passes; other completion blockers (validation, abilities) still keep `productionReady` honest

### P2 — Manifest maturity backfill
- `backfillProjectAssetMaturity` / `backfillManifestMaturity` in `@metroforge/generation` uses `inferAssetMaturity` from `@metroforge/shared`
- Idempotent: fills only missing/empty `maturity` / `productionReady` / `sourceType`
- IPC `backfill-asset-maturity`; CLI `metroforge project backfill-maturity <slug> [--dry-run]`
- Also CLI `metroforge project allow-placeholders <slug> [--enable|--disable]`
- Buttons: Asset Gallery + Export “Backfill maturity”

### P3 — Polish
- Gate panel wording updated for the new toggle path only (no visual redesign)

## Validation

| Command | Result |
|---|---|
| `vitest` backfill + project-meta + completion + shared maturity | **4 files / 16 tests PASS** |
| `pnpm --filter @metroforge/generation build` | PASS |
| `pnpm --filter @metroforge/desktop typecheck` | PASS |
| `pnpm --filter @metroforge/cli typecheck` (+ build) | PASS |
| Live backfill on `a-wind-swept-marsh-kingdom-with-a-hidden-crypt` | 102 updated → second run 0 updated / 102 skipped |
| Live allowPlaceholders toggle | gate `passed=true` when enabled; restored to `false` after probe |
| NVIDIA `checkHealth` | `true` (key present) |
| NVIDIA `getHealthDetails` | **DEGRADED** — API reachable but configured model `black-forest-labs/flux.1-schnell` not listed |
| ComfyUI `checkHealth` | `false` (localhost:8188 not healthy) |
| Fresh TINY_TEST generate | **not** started (avoid hang) |

## Remaining blockers

- Procedural PLACEHOLDER art remains default without a healthy image path that actually generates non-fallback assets — **not production-complete**
- NVIDIA image probe is **DEGRADED** (API up, configured FLUX model not listed); ComfyUI unhealthy (`localhost:8188`)
- Sample project still has non-art blockers (`Validation not passed`, unknown ability `wind_disc`) even when placeholders are allowed
- Per-provider enable toggles in Settings still absent (only allowPlaceholders project control added)

## Next pass recommendation

1. With NVIDIA healthy (and/or Comfy up): regenerate TINY_TEST → confirm non-PLACEHOLDER maturity + Studio not DEGRADED for art + Inspector selected provider
2. Optional: Settings provider enable toggles
3. Repair/accept path for leftover sample blockers (abilities registry / validation report rewrite)
4. Full `pnpm test` sweep if CI not already green
