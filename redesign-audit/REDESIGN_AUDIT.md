# MetroForge Visual Redesign Audit

**Scope:** Document the **current** Concept A UI only. No redesign in this pass.  
**Reference direction:** premium dark IDE / workstation (`docs/ui-redesign/CONCEPT_A_REFERENCE.png`).  
**Capture project:** `GeneratedGames/nvidia-image-activation-smoke` (wind-swept project not present).  
**Capture tool:** `tools/redesign-audit/capture.mjs` @ 1920×1080 (principal), plus responsive + alternates.  
**Built app:** `pnpm --filter @metroforge/desktop build` then Playwright Electron launch.

Ratings: **EXCELLENT** | **GOOD** | **NEEDS IMPROVEMENT** | **MAJOR REDESIGN REQUIRED**

---

## Executive summary

Concept A **tokens, shell chrome, and several AI/ship screens** already read as a coherent dark workstation. Density and accent discipline (`#258cff`, slate borders, 4–8px radius) match the brief. Largest gaps: **empty content regions on sparse projects**, **editor canvases that do not fill with useful visualization when data is missing**, **collapsed-sidebar launch sticky state**, and **inconsistent use of shared primitives vs one-off markup**.

Smoke project has limited world/room/asset data — many empty states are **real**, not fake. That is useful for empty-state UX audit but under-represents rich editor fills.

---

## Screen-by-screen ratings

### 01 Dashboard — NEEDS IMPROVEMENT
- Hierarchy / density: Shell good; main body often a single empty/error card (“Dashboard unavailable”) with large unused viewport.
- Consistency: Header/eyebrow pattern matches other screens.
- Flags: excessive empty space; weak content when `getProjectDashboard` fails/empty; KPI row from Concept A not visible without data.

### 02 New Game — GOOD
- Compact create form over dark surface; primary action clear.
- Risks looking like a generic web form at wide widths (fields stretch).
- Flags: form stretch; limited toolbar chrome.

### 03 Generation Studio — GOOD
- Strong Concept A structure: request bar, 3-pane timeline/preview/inspector, activity filters.
- Idle state intentional (“No preview yet”, PENDING badges).
- Flags: large empty preview panel when idle; phase list can feel long/scroll-heavy.

### 04 Projects — GOOD
- Table/list density appropriate; fits library workflow.
- Flags: can feel sparse with few projects; ensure row hover/selected clarity.

### 05 Asset Gallery — NEEDS IMPROVEMENT
- Toolbar + category filters exist; inspector pattern is right.
- On smoke project, grid/empty states dominate; cards can look underfilled.
- Flags: empty-space usage; weak empty-state hierarchy vs Concept A dense browser.

### 06 Manual Generator — GOOD
- Compact foundry columns; real pipeline controls.
- Flags: form-like layout; inspector empty until generation (skipped in audit).

### 07–09 World Editor (Progression / Graph / Spatial) — NEEDS IMPROVEMENT → MAJOR for canvas fill
- Correct 3-region editor shell + CommandBar + tabs.
- Graph/spatial canvases often under-populated; progression view similar.
- Flags: unused panel regions; small/absent graph in large center; unclear controls when no nodes.

### 10–15 Room Editor layers — MAJOR REDESIGN REQUIRED (workspace fill) / GOOD (chrome)
- Left rail Layers + Tools + Rooms matches Concept A intent; zoom chrome present.
- Smoke project: “No rooms” / “No room” — entire center is empty dark void across all six layers (layer switching barely changes the void).
- Debug layer still oriented around raw/technical dump when data exists (code path).
- Flags: excessive empty space; insufficient visual grouping of tools vs layers; tools are layer aliases (VIS/COL/…) not true paint tools; raw debug as primary mode risk.

### 16 Dungeon Editor — NEEDS IMPROVEMENT
- Same editor shell family; empty dungeon graph on smoke project.
- Flags: unused center; inspector thin.

### 17 Game Preview — NEEDS IMPROVEMENT
- Preview/Godot actions present; large empty preview stage without playable snapshot.
- Flags: oversized empty container; placeholder dominance when no preview artifact.

### 18 Models — GOOD
- Hardware summary + table + inspector reads professional.
- Flags: table density vs viewport; selected-row affordance must stay obvious.

### 19 Providers — GOOD
- Health cards + key presence (**configured / not set** only) match policy.
- Flags: card vs table consistency; long pages possible.

### 20 Routing Inspector — GOOD
- Request / Selected / Fallbacks + Candidates | Rejected + health log matches Concept A closely.
- DEGRADED / no healthy image provider empty states are clear and honest.
- Flags: “Inspecting…” button label can confuse; rejected/candidates empty messaging overlaps.

### 21 QA — GOOD
- Environment | Project gates split is clear; real doctor/gates only.
- Flags: status chips small; failure prominence depends on data; nested scroll risk.

### 22 Export — GOOD
- Preflight/export center structure present.
- Flags: blocking vs warning hierarchy must stay high-contrast; form stretch.

### 23 Settings — GOOD
- Sectioned preferences, worker pool, env, API key status (booleans only).
- Flags: long scrolling page; web-form feel in places.

---

## Phase 8 — Specific difference flags (observed)

| Flag | Where observed |
|------|----------------|
| Excessive empty space | Dashboard empty card; Room/World/Dungeon/Preview canvases on smoke data |
| Weak visual hierarchy | Dashboard when data missing; some screen descriptions louder than content |
| Oversized containers / unused panel regions | Editor centers; Studio idle preview |
| Inconsistent inspector widths | Editors share `--inspector-w` but content density varies |
| Collapsed sidebar sticky after narrow launch | `App.tsx` media query collapses but does not re-expand on widen — audit capture forces expand at ≥1600 |
| Abbreviation-only nav when collapsed | Usable but learnability cost; tooltips required |
| Forms that look like generic web forms | Create, Manual Generator, Settings |
| Insufficient true editor tools | Room “tools” map to layers, not paint/select/erase implements |
| Raw JSON / debug as mode | Room Debug layer |
| Weak empty states | Some inline hints in huge voids vs structured `EmptyState` |
| Nested scroll / long pages | Studio phases + activity; Settings; QA |
| Status information easy to miss | 0.64rem mono status strip — dense but easy to overlook |
| Inconsistent tabs / buttons | `ui.Tabs` vs raw `.tab`; mixed `mf-btn` vs plain `button` |
| Placeholder procedural path visible | Routing SELECTED DEGRADED placeholder fallback messaging (honest, but visually dominates) |

---

## Phase 9 — Functional visual states

| State | Where implemented | Notes |
|-------|-------------------|-------|
| Idle | Studio, StatusBar | Explicit Idle + PENDING phases |
| Hover | buttons, nav, cards | Tokenized `--bg-surface-hover` |
| Selected | `.nav-item.active`, `.tab.active`, asset cards, model rows | Blue fill / border |
| Focus | `:focus-visible` 2px `--focus` | Present globally |
| Disabled | `button:disabled` opacity 0.5 | Preview disabled without project |
| Loading | Routing “Inspecting…”, generation Generating… | Present in code paths |
| Success | Badge success, status-dot.ok, check-pass | Providers/QA |
| Warning | Badge warning, DEGRADED, check-warn | Routing/Providers key not set |
| Failure | Badge danger, QA FAIL | Depends on project gates |
| Empty | EmptyState + inline hints | Editors/gallery/dashboard |
| Offline / provider unavailable | Providers health + Routing no healthy provider | Captured in routing alts |

**High-value screens for state redesign later:** Generation Studio, Providers, Routing Inspector, QA, Export.

---

## What’s working (keep)

1. Token system + legacy aliases (`tokens.css`)
2. App shell grid (44 / 216 / 26 metrics)
3. Generation Studio 3-pane + activity filters
4. Routing Inspector Concept A card row + tables
5. Providers/Settings key presence without secrets
6. Room Editor left-rail information architecture (even when empty)
7. Keyboard Jump / sidebar collapse shortcuts

## Gaps vs Concept A reference board

1. Dashboard KPI row + recent table not visible without healthy dashboard IPC data
2. Room Editor not yet a “filled level tool” without rooms/tileset atlas
3. World graph nodes not dense/status-colored like board when graph thin
4. Sidebar on board shows icons+labels; collapsed rail is abbreviation tiles
5. Fallbacks “radar” viz intentionally omitted (no fake charts)

---

## Screenshot index

Principal: `screenshots/01-dashboard.png` … `23-settings.png`  
Alternates: `generation-idle`, asset-gallery-*, routing-*, qa-*  
Responsive: `screenshots/responsive/*-{1600x900,1366x768}.png`  
Overview: `metroforge-current-ui-overview.png`  
Skipped: `generation-running.png` (hang risk)
