# MetroForge P4 — AI Operations + Model Routing + QA Plan

**Date:** 2026-08-14  
**Constraint:** Continue P1–P3. Do not restart architecture, invent APIs, or fake provider/model/health/QA/routing data. Stop after P4 (no P5).

**Visual SoT:** Concept A + `--forge-*` tokens. Target **1600×900** (+ 1920 / 1366 captures).

---

## STEP 0 — Audit (existing)

| Area | Location | IPC / data | Notes |
|------|----------|------------|--------|
| ModelsScreen | `studio/ModelsScreen.tsx` | `listModels`, `getHardwareProfile`, `scoutModels`, `downloadModel` | 3-col layout; filters modality-only; flat inspector; virtualized table ~36px |
| ProvidersScreen | `studio/ProvidersScreen.tsx` | `listProviders`, `getConfig`, `setAppSettings` | Summary + cards + key presence + image table; no Refresh Health button |
| RoutingInspector | `studio/RoutingInspector.tsx` | `explainModelRouting`, `runDoctor` | Request/Selected/Fallbacks + candidates/rejected; reasons as long strings; no rejection tags |
| QAScreen | `studio/QAScreen.tsx` | `runDoctor`, `getValidationResults`, `runProjectAcceptance`, checkpoints | 2-col env|gates; checkpoints under env — need ~30/48/22 three-col |
| Shared UI | `studio/ui/index.tsx` | — | Panel, InspectorPanel, Metric, Badge, DataTable, EmptyState, Editor* from P1–P3 |
| Tokens | `tokens.css` / `styles.css` | — | `--forge-*`; models/routing/qa layout rules present |
| Backend | `packages/ai` ModelRegistry / `explainModelRouting`; image router; doctor/acceptance | Preserve — **no backend rewrite**; UI may map rejection strings → tags only |

**Honesty rules**

- IMAGE_GENERATION with 0 candidates → show **ZERO** (no fake FLUX).
- Offline Comfy → **OFFLINE / Unavailable** from real health.
- Score breakdown UI **only** from candidate `reasons` / score fields the backend already returns — never invent +25/+20 rows.
- Credentials: presence-only (`envKeys.*` booleans).
- Starter pack: `hardware.starterPack` IDs only; installed mark only if catalog says installed.

**Screenshot project:** prefer wind-swept if present; else richest `GeneratedGames/*`.

---

## P4.1 Shared AI ops layout

Add thin wrappers in `studio/ui/index.tsx` (reuse Panel / Inspector / Metric):

- `AiOpsWorkbench` — screen shell
- `AiOpsSummary` — metric strip
- `AiOpsContext` — left rail
- `AiOpsPrimary` — main workspace
- `AiOpsInspector` — right 280–320px
- `AiOpsLog` — optional bottom diagnostic drawer
- Shared `HealthDot` / status tone helpers (extend `statusToTone` if needed)

Layout: header → summary → context | primary | inspector → optional log.

## P4.2 Models

- Compact hardware profiler + starter pack (installed vs recommended from real data)
- Search + filters: provider, capability, modality, license, installed, routable, hardware fit
- Dense table (~36–44px): Model / Provider / Modality / Routable / Installed / License / Hardware / Action
- Compatibility clarity (VRAM/RAM blocked vs Fits vs Cloud)
- Inspector sections: Model / Status / License / Hardware / Capabilities / Quality / Actions
- Empty filter state; cross-nav Routing / Providers; LOW_RESOURCE badge UX

## P4.3 Providers

- Summary counts from real `listProviders` + `envKeys`
- Refresh Health = re-invoke `listProviders` + `getConfig` (live probe) — no polling loop
- LOCAL/HOSTED cards; credentials presence list; image providers table

## P4.4 Routing

- Structured Request / Selected / Fallbacks
- Candidates table; structured rejected rows + expandable details
- Map rejection reason strings → readable tags (no decision changes)
- Intentional zero-route empty + blockers computed from real rejected[] / providers
- Score “breakdown” = display backend `reasons` that already encode factors; omit numeric invention

## P4.5 QA

- Three columns ~30% / 48% / 22%: Environment | Validation | Checkpoints
- Structured doctor rows (group when name prefixes allow; keep exact status/message)
- Expandable gates; skip-runtime warning styling; honest empty checkpoints

## P4.6–18

Shared status semantics, mono IDs/versions, table polish, inspector 280–320, empties, LOW_RESOURCE, cross-nav, status bar visible, responsive 1920/1600/1366, a11y, no health polling loops.

## Deliverables

- Screenshots → `redesign-audit/screenshots/p4/` (`01-models` … `10-qa-checkpoints`)
- `capture-p4.mjs`, typecheck + desktop build
- `P4_IMPLEMENTATION_REPORT.md`

## Out of scope

P5+, IPC/backend redesign, commits, fake routing candidates.
