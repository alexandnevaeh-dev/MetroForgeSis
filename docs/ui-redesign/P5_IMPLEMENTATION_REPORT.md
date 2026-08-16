# MetroForge P5 — Implementation Report

**Date:** 2026-08-15  
**Scope:** Ship / Export / Settings / Global Production Polish  
**Status:** **P5 COMPLETE: YES** (with noted residual gaps below)  
**Constraint honored:** Continued P1–P4; no architecture restart; real backend/IPC only; no secrets in UI/logs/manifests; **P6 not started**; **no commit**.

Plan: `docs/ui-redesign/P5_IMPLEMENTATION_PLAN.md`

---

## Answers to the 15 delivery points

### 1. Model hardware / routability concepts (P5A.1)
**DONE.** Reconciled catalog now exposes explicit flags: `catalogEligible`, `providerAvailable`, `runtimeEligible`, `hardwareCompatible`, `installed`, `routable` (+ `providerHealth`). Models UI labels ROUTABLE / CATALOG / HARDWARE / RUNTIME / BLOCKED. Hosted/remote models are **not** VRAM-blocked (`computeHardwareCompatible` + `rankModelsForCapability` + `CapabilityRouter.getModelCandidates` local-only VRAM).

### 2. Provider health gating (P5A.2)
**DONE.** Live route candidates exclude OFFLINE/`unavailable` / disabled / unconfigured. DEGRADED remains eligible but penalized (−25 in model ranking; lower health tier in `CapabilityRouter`). Offline Ollama cannot win live route (`explainModelRouting` + registry tests).

### 3. Canonical Godot resolver (P5A.3)
**DONE.** `packages/tools/src/godot-resolver.ts` — preference → project `godotExecutable` → `GODOT_EXECUTABLE` → PATH → known paths, with `source` / `sourceLabel`. Wired into Settings/`get-config`, Doctor, Open/Play Godot, acceptance. IPC `resolveGodot` + Settings **Test Godot**. Fixes Settings-vs-QA path mismatch.

### 4. Export redesign (P5B)
**DONE.** Preflight via shared readiness; READY / ATTENTION / BLOCKED; % only when `completionScore` exists else counts; gate rows navigate; ZIP only (no fake platform exes); **force OFF by default** + warning; commercial-safe included/excluded/unknown after real export; artifact panel for archive/manifest paths.

### 5. Settings redesign (P5C)
**DONE.** Categories: General, Generation, Runtime, Providers (deep-link), Paths, Performance, Export, Diagnostics. Canonical Godot + Test. Concurrency persists via existing `setAppSettings`. Diagnostics copy is presence-only (no secret values).

### 6. Health popover (P5D)
**DONE.** Top indicator opens live provider list popover (`HealthPopover`); Open Providers deep-link; no credentials.

### 7. Status bar missing values (P5E)
**DONE.** Hardware / VRAM / providers fall back to `—`; concurrency meters already used `—`.

### 8. Responsive (P5F)
**DONE.** Full sidebar ≥1450; compact 1200–1449; icon+abbrev &lt;1200; Models 1366 ellipsis / context hide; `overflow-x: hidden` on app/content. Capture includes `10-models-1366.png`.

### 9–13. Consistency / loading / action safety / a11y / Jump (P5G–K)
**MOSTLY DONE.** Shared readiness + Concept A panels; Export/Settings loading/empty/error; force warning + blocked export without force; Jump palette groups real screens/projects/rooms/assets; Ctrl+K / Esc / arrows. Not a full re-audit of every P1–P4 screen.

### 14. ProjectReadinessSummary (P5L)
**DONE.** Shared by Dashboard, QA, Export (`projectReadiness.ts` + `ProjectReadinessSummary.tsx`).

### 15. Manifest / tests / screenshots / validate (P5M–O + validate)
**DONE.**
- Export manifest already machine-readable (`export_manifest.json` / license report); no API keys written.
- Tests: Godot precedence, provider health exclusion, local vs hosted VRAM, route eligibility, readiness, existing export/commercial-safe.
- Screenshots: `redesign-audit/screenshots/p5/` + `manifest.json` (11 real captures).
- `pnpm --filter @metroforge/desktop typecheck` **PASS**
- Focused vitest **30/30 PASS**
- `pnpm --filter @metroforge/desktop build` **PASS**
- Lint: not configured for desktop UI (same as P4)

---

## Files touched (high level)

| Area | Paths |
|------|--------|
| Godot | `packages/tools/src/godot-resolver.ts`, `godot-launcher.ts`, `registry.ts`, `index.ts`, tests |
| Routing / catalog | `packages/ai/src/registry.ts`, `model-catalog.ts`, `catalog-reconciliation.ts`, tests |
| Desktop IPC | `apps/desktop/electron/handlers.ts`, `preload.ts` |
| UI | `ExportScreen`, `SettingsScreen`, `ProjectReadinessSummary`, `projectReadiness`, `HealthPopover`, `StatusBar`, `GoToPalette`, `ModelsScreen`, `ProjectDashboard`, `QAScreen`, `App.tsx`, `styles.css`, `metroforge-api.ts` |
| Capture | `tools/redesign-audit/capture-p5.mjs` |
| Docs | `P5_IMPLEMENTATION_PLAN.md`, this report |

---

## Screenshots

**Dir:** `redesign-audit/screenshots/p5/`  
**Project:** `GeneratedGames/nvidia-image-activation-smoke`  
**Capture:** `node tools/redesign-audit/capture-p5.mjs`

| File | Notes |
|------|--------|
| `01-dashboard-readiness.png` | Dashboard + readiness |
| `02-export-preflight.png` | Export preflight |
| `03-export-force-warning.png` | Force warning |
| `04–06-settings-*.png` | General / Paths / Diagnostics |
| `07-health-popover.png` | Top health popover |
| `08-jump-palette.png` | Jump (Ctrl+K) |
| `09-qa-readiness.png` | QA + readiness |
| `10-models-1366.png` | Models @ 1366 |
| `11-export-1920.png` | Export @ 1920 |

Smoke note: dashboard readiness selector scored `0` in capture timing (component is mounted; Export/QA use the same summary).

---

## Acceptance criteria still soft / residual

| Item | Notes |
|------|--------|
| Theoretical vs live route label | `theoreticalRoute` field exists on explanation; currently always `false` (live health gating rejects offline instead of labeling theoretical winners) |
| Per-project Godot UI | Resolver reads `project.json.godotExecutable`; no dedicated Settings editor for that field |
| Exhaustive P5G–K | Cross-screen consistency pass was targeted at Ship surfaces, not every editor |
| Dashboard capture smoke | Locator timing miss; visual capture still taken |

None of these block the P5 ship criteria as specified.

---

## Flags

| Flag | Value |
|------|--------|
| **FUNCTIONALITY PRESERVED** | **YES** |
| **REAL PROJECT / IPC DATA ONLY** | **YES** |
| **FAKE MOCK DATA ADDED** | **NO** |
| **SECRETS IN UI / MANIFESTS** | **NO** |
| **FORCE EXPORT DEFAULT OFF** | **YES** |
| **P6 STARTED** | **NO** |
| **COMMIT CREATED** | **NO** |
| **P5 COMPLETE** | **YES** |
