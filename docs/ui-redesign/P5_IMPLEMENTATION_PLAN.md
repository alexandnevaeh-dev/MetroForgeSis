# MetroForge P5 — Ship / Export / Settings / Global Production Polish

**Date:** 2026-08-15  
**Constraint:** Continue P1–P4. Do not restart architecture, invent fake screens/states, or put secrets in UI/logs/manifests. Stop after P5 (no P6). No commit unless asked.

**Visual SoT:** Concept A + `--forge-*` tokens. Target **1600×900** (+ 1920 / 1366).

---

## STEP 0 — Audit (existing)

| Area | Location | Findings |
|------|----------|----------|
| ExportScreen | `studio/ExportScreen.tsx` | Preflight from `getProjectDashboard.completion`; **force defaults ON**; statuses READY/WARNING/BLOCKING (want ATTENTION/BLOCKED); % from completionScore; no gate-nav rows; no post-export artifact panel; commercial-safe checkbox only |
| SettingsScreen | `studio/SettingsScreen.tsx` | Flat panels; Godot path preference exists; concurrency persists; no Test Godot; no category nav; provider toggles present |
| Godot resolution | `tools/registry.detectGodot`, `godot-launcher`, `handlers.ts` | **Mismatch:** Settings/`get-config` uses prefs→env; Doctor/Open/Play/acceptance use **env only** (`config.godotExecutable`). No known-path scan; no source label |
| Models flags | `catalog-reconciliation`, `ModelsScreen` | Has `routable` / `providerEnabled` / `liveListed` / `installed` — missing explicit catalogEligible / runtimeEligible / hardwareCompatible / selected |
| VRAM gating | `rankModelsForCapability` | Hosted already skip local VRAM; `CapabilityRouter.getModelCandidates` still applies `maxVramMb` to **all** models |
| Provider health | `CapabilityRouter` | Ranks healthy-first but **never excludes** unavailable — offline Ollama can still be sole/live candidate |
| Status bar | `StatusBar.tsx` / `ConcurrencyMeters` | Mostly uses `—`; health top button navigates Providers (no popover) |
| Jump palette | `GoToPalette.tsx` | Real screens/projects/rooms/assets only |
| Dashboard readiness | `ProjectDashboard.tsx` | Inline completion UI; **not shared** with Export/QA |
| AssetProductionGate | `AssetProductionGatePanel` + `project-completion` | Real gate; Export/Dashboard both consume |

**Honesty rules**

- Real IPC / completion / QA / export only — no mocked READY.
- Force export OFF by default + explicit warning.
- Build options only ZIP / Godot package (no fake Windows/Mac/Linux exe builders).
- Manifests: no API keys / secrets.
- Screenshot only real states.

**Screenshot project:** wind-swept if present; else richest `GeneratedGames/*`.

---

## Execution order

### P5A — P4 consistency first
1. **Eligibility concepts** on reconciled catalog + Models/Routing labels: `catalogEligible`, `providerAvailable`, `runtimeEligible`, `hardwareCompatible`, `installed`, `routable`, `selected` (routing). Hosted ≠ local VRAM block. Selected route must meet runtime requirements; label theoretical vs live if needed.
2. **Provider health gating:** OFFLINE/DISABLED/UNCONFIGURED rejected from live route; DEGRADED penalized; HEALTHY eligible. Update `CapabilityRouter` + `explainModelRouting` (+ tests). Offline Ollama must not win.
3. **Canonical Godot resolver** (`packages/tools`): preference → project `godotExecutable` → `GODOT_EXECUTABLE` → PATH → known install paths; return `{ path, source, version? }`. Wire Settings, Doctor, Preview, Play, Open Godot, QA/acceptance, export preflight.

### P5B — Export redesign
Release pipeline UX: real preflight; READY / ATTENTION / BLOCKED; % only if real else counts; gate rows → navigate; ZIP + package only; force OFF + warning; commercial-safe included/excluded/unknown; artifact panel after real export.

### P5C — Settings redesign
Categories: General, Generation, Runtime, Providers (deep-link), Paths, Performance, Export, Diagnostics. Canonical Godot + Test. Worker concurrency persist. Diagnostics copy without secrets.

### P5D — Health popover from top indicator (live providers; no secrets).

### P5E — Status bar: never show `undefined`; use `—`.

### P5F — Responsive: full sidebar ≥1450; compact 1200–1449; icon+tooltip &lt;1200. Fix Models 1366 letter clipping. No global horizontal scroll.

### P5G–K — Consistency, loading/empty/error, action safety, a11y/shortcuts, Jump polish.

### P5L — `ProjectReadinessSummary` shared by Dashboard / QA / Export.

### P5M — Export manifest machine-readable (existing pipeline); scrub secrets.

### P5N — Tests listed in brief.

### P5O — `redesign-audit/screenshots/p5/` + `manifest.json`.

### Deliver
`P5_IMPLEMENTATION_REPORT.md` + 15-point acceptance answer. Honest COMPLETE YES/NO.

---

## Out of scope
P6, commits, architecture rebuild, fake platform export executables.
