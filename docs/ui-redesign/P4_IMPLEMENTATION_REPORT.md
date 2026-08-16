# MetroForge P4 — Implementation Report

**Date:** 2026-08-14  
**Scope:** AI Operations + Model Routing + QA (Models / Providers / Routing / QA)  
**Status:** **P4 COMPLETE: YES**  
**Constraint honored:** Continued P1–P3; no architecture restart; ModelRegistry / CapabilityRouter / providers / catalog / downloads / hardware / explainModelRouting / doctor / acceptance / checkpoints preserved; no fake provider/model/health/QA/routing data; **P5 not started**.

Visual SoT: Concept A + `--forge-*` tokens. Primary viewport **1600×900** (+ 1920 / 1366 Models).

Plan: `docs/ui-redesign/P4_IMPLEMENTATION_PLAN.md`

---

## 1. Shared AI ops layout (P4.1)

Added to `apps/desktop/src/studio/ui/index.tsx`:

| Component | Role |
|-----------|------|
| `AiOpsWorkbench` | Screen shell (`models` / `providers` / `routing` / `qa`) |
| `AiOpsSummary` | Metric strip |
| `AiOpsBody` | Context \| Primary \| Inspector grid |
| `AiOpsContext` | Left context rail |
| `AiOpsPrimary` | Main workspace + toolbar |
| `AiOpsInspector` | Right inspector (280–320 via `--inspector-w`) |
| `AiOpsLog` | Optional diagnostic drawer |
| `HealthDot` / `RejectionTagBadge` | Shared status + rejection tags |

Helpers: `apps/desktop/src/studio/aiOpsShared.ts` (health normalize, hardware fit, rejection tag map, route blockers, doctor categories, score-factor parse from **real** reason strings).

---

## 2. Models (P4.2)

- Compact hardware profiler + **real** `starterPack` (✓ installed vs ○ recommended from catalog)
- Summary metrics: models / routable / installed / blocked / profile (`LOW_RESOURCE` hint)
- Search + filters: provider, capability, modality, license, installed, routable, hardware fit
- Dense virtualized table (~40px): Model / Provider / Modality / Routable / Installed / License / Hardware / Action
- Compatibility: Fits / Low VRAM / RAM blocked / Cloud; inspector VRAM current vs required + BLOCKED
- Inspector sections: Identity / Status / License / Hardware / Capabilities / Quality / Actions
- Empty filter state; cross-nav Routing / Providers; Install/Get only when `downloadable`

---

## 3. Providers (P4.3)

- Summary counts from live `listProviders` + `envKeys` (not faked)
- **Refresh Health** = re-invoke `listProviders` + `getConfig` (probe on demand; **no polling loop**)
- LOCAL / HOSTED cards with HealthDot + priority / enabled / id
- Credentials presence-only list (never secrets)
- Image providers table; Comfy shows **OFFLINE** when health fails; NVIDIA reason text from backend

---

## 4. Routing (P4.4)

- Request / Selected / Fallbacks structured
- Score factors shown **only** when candidate `reasons` already encode them (e.g. `installed +50`); otherwise explicit “no structured breakdown”
- Candidates table; structured rejected rows + expandable details
- Rejection strings mapped to tags (`PROVIDER_OFFLINE`, `HARDWARE_VRAM`, …) — **display only**, decisions unchanged
- Zero-candidate empty + blockers computed from real `rejected[]`
- IMAGE_GENERATION with healthy NVIDIA → real `nvidia-image` winner (not invented FLUX catalog row); offline Comfy stays rejected

---

## 5. QA (P4.5)

- Three columns ~**30 / 48 / 22**: Environment | Project validation | Checkpoints
- Doctor rows grouped (TOOLCHAIN / AI PROVIDERS / …) with expand details; mono versions
- Ready meter from real pass counts (warnings ≠ pass)
- Gates expandable; skip-runtime **BYPASS** warning styling
- Honest empty gates / checkpoints when none stored

---

## 6. Shared polish (P4.6–18)

| Item | Status |
|------|--------|
| Shared status semantics | YES (`HealthDot` / `statusToTone` / badges) |
| Mono for IDs / versions | YES |
| Table polish / dense rows | YES |
| Inspector 280–320 | YES (`--inspector-w` / max 320) |
| Empty states | YES (honest) |
| LOW_RESOURCE UX | YES (badge + starter pack + status bar) |
| Cross-nav | YES (Models↔Providers↔Routing↔QA↔Export↔Settings) |
| Status bar visible | YES (capture manifest) |
| Responsive 1920 / 1600 / 1366 | YES (+ stack ≤1100) |
| a11y | listbox/keyboard models; expand aria; labels |
| No health polling loops | YES (manual refresh only) |

---

## 7. Files touched

- `studio/ui/index.tsx`, `studio/aiOpsShared.ts`
- `ModelsScreen.tsx`, `ProvidersScreen.tsx`, `RoutingInspector.tsx`, `QAScreen.tsx`
- `styles.css`
- `tools/redesign-audit/capture-p4.mjs`
- `docs/ui-redesign/P4_IMPLEMENTATION_PLAN.md`, `P4_IMPLEMENTATION_REPORT.md`

---

## 8. Screenshots

**Dir:** `redesign-audit/screenshots/p4/`  
**Project:** `GeneratedGames/nvidia-image-activation-smoke`  
**Capture:** `node tools/redesign-audit/capture-p4.mjs`

| File | Notes |
|------|--------|
| `01-models.png` | Hardware + catalog + inspector |
| `02-model-selected.png` | Selected row / inspector |
| `03-providers.png` | Summary + cards + credentials + image table |
| `04-routing-no-route.png` | IMAGE_GENERATION live (1 real nvidia candidate / 10 rejected — not faked) |
| `05-routing-candidates.png` | Candidates after capability refresh |
| `06-routing-rejected.png` | Structured rejected + tags |
| `07-qa-full.png` | 3-column QA |
| `08-qa-environment.png` | Doctor groups |
| `09-qa-project-gates.png` | Validation + empty gates |
| `10-qa-checkpoints.png` | Honest empty checkpoints |
| `01-models-1920.png` / `01-models-1366.png` | Multi-res |

---

## 9. Functional smoke

From capture manifest:

- Models select / catalog: **PASS**
- Providers cards + Refresh Health: **PASS**
- Routing inspect / rejected expand: **PASS**
- QA three panels: **PASS**
- Status bar visible: **YES**
- IPC unchanged (listModels, getHardwareProfile, scoutModels, downloadModel, listProviders, getConfig, explainModelRouting, runDoctor, validation, acceptance, checkpoints)

---

## 10. Build / typecheck

| Check | Result |
|-------|--------|
| `pnpm --filter @metroforge/desktop typecheck` | **PASS** |
| `pnpm --filter @metroforge/desktop build` | **PASS** |
| Lint | Not configured for desktop UI |

---

## Flags

| Flag | Value |
|------|--------|
| **FUNCTIONALITY PRESERVED** | **YES** |
| **REAL PROJECT / IPC DATA ONLY** | **YES** |
| **FAKE MOCK DATA ADDED** | **NO** |
| **FAKE FLUX / ROUTING CANDIDATES** | **NO** |
| **16:9 VISUAL QA COMPLETED** | **YES** (1600×900 + 1920 + 1366) |
| **P5 STARTED** | **NO** |

---

## Notes

- Live IMAGE_GENERATION on this machine selected real `nvidia-image` (healthy); Comfy/Diffusers remain offline/rejected — UI shows that honestly.
- Score numeric component table is not fabricated when backend only returns total score + textual reasons.
- No commit created (not requested).
