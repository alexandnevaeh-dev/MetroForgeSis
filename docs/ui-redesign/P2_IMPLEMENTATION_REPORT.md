# MetroForge P2 — Implementation Report

**Date:** 2026-08-14  
**Scope:** Global design system + application shell  
**Status:** **P2 COMPLETE: YES**  
**Constraint honored:** No IPC/backend rewrite; no mocked data; P1 editor layouts preserved; P3 not started.

---

## Summary

P2 consolidates Concept A into a single token source (`--forge-*`), expands shared studio UI primitives, and upgrades the shell (top command bar breadcrumb + live health, left nav, status strip) so every workspace inherits the same visual system without deep per-screen redesigns.

---

## Files touched

### Design system
- `apps/desktop/src/tokens.css` — SoT palette, spacing, type, shell metrics; `--forge-*` → Concept A / `--mf-*` / legacy aliases
- `apps/desktop/src/styles.css` — shell polish, panel pads, control heights, typography utilities, shared component CSS, responsive shrink

### Shell
- `apps/desktop/src/App.tsx` — top bar: brand, project, breadcrumb/context, Ctrl+K Jump, New Game / Studio / Preview, live provider health badge; nav + shortcuts unchanged
- `apps/desktop/src/studio/StatusBar.tsx` — version | workspace | project | HW | VRAM/RAM | providers | LLM/IMG/AUD/CPU | Idle/jobs | Ctrl+K (real IPC)
- `apps/desktop/src/studio/ScreenHeader.tsx` — typography classes (`type-page-title`, `type-label`, `type-body-secondary`)

### Shared components
- `apps/desktop/src/studio/ui/index.tsx` — expanded library (see below)

### Screen migration (visual inherit only)
- All destination screens use `workspace-screen` (+ existing screen class)
- `SettingsScreen.tsx` — `Button` / `LoadingState` / `ErrorState`
- `ProvidersScreen.tsx` — `Button` for Settings CTA
- `AssetsGallery.tsx` / `ModelsScreen.tsx` — `SearchField`

### Docs
- `docs/ui-redesign/P2_IMPLEMENTATION_REPORT.md` (this file)

---

## Shared components (`studio/ui/`)

| Component | Role |
|-----------|------|
| `Button` | primary / secondary / ghost / icon / danger (+ sizes) |
| `ButtonStrip` | action groups |
| `Input` / `Select` / `TextArea` / `SearchField` | standardized controls |
| `Panel` / `PanelHeader` / `PanelBody` / `PanelFooter` | compound panels |
| `InspectorPanel` | right inspector shell |
| `Toolbar` | compact tool row |
| `PropertyRow` / `PropertySection` | label/value inspector rows |
| `StatusBadge` | PASS / WARN / FAIL / PENDING / RUNNING (+ tone map) |
| `Badge` / `Metric` | chips + KPI tiles |
| `EmptyState` / `ErrorState` / `LoadingState` | feedback |
| `DataTable` / `DensityGrid` | dense data |
| `Tabs` / `SegmentedTabs` / `ViewModeTabs` | navigation strips |
| `EditorWorkspace` / `EditorToolbar` / `EditorViewport` / `EmptyViewport` / `InspectorSection` | P1 editor foundations (preserved) |

---

## Tokens

**Surfaces:** `#080B0F`, `#0B1016`, `#10161D`, `#141C25`, `#0A0F15`, `#17222E`, `#102737`  
**Accents:** `#38B2F6`, `#238CFF`  
**Semantics:** success / warn / fail / info / pending / running  
**Spacing:** 4–32 (`--forge-space-*`)  
**Controls:** 26–34px heights; panel pad 12–16; radius 5–7  
**Type scale:** page / section / panel / body / body-secondary / label / caption / technical / status / numeric  

One source of truth: `--forge-*` with Concept A and `--mf-*` aliases mapped in the same file.

---

## Shell

```
┌ Top command bar (brand · project · breadcrumb · Jump Ctrl+K · New Game/Studio/Preview · health) ┐
├ Left nav (CREATE/LIBRARY/WORLD/AI/SHIP) ┤ Main workspace (scroll) ┤
└ Status strip (version · nav · project · HW · VRAM · providers · concurrency · idle · Ctrl+K) ───┘
```

- Fixed `100vh` grid; status always visible
- Sidebar collapse + **Ctrl+B** preserved; **Ctrl+K** / **Ctrl+1–6** preserved
- Active nav: blue tint + left indicator
- Health indicator: live `listProviders` only (no fake “nominal” when unhealthy)

---

## Responsive + scroll

- Desktop-first; usable **1366**; intentional density at **1920**
- Medium: multi-column layouts shrink (existing editor/dashboard breakpoints kept)
- Shell fixed; `.content` scrolls; editor viewports prefer internal scroll
- At ≤1366: auto-collapse rail, hide crumb project + Jump label + status Ctrl+K hint

---

## Tests / build

| Check | Result |
|-------|--------|
| `pnpm --filter @metroforge/desktop typecheck` | **PASS** |
| `pnpm --filter @metroforge/desktop build` | **PASS** |
| Lint | Not separately configured for desktop UI (typecheck used) |
| Launch visit | **PASS** — `capture-after.mjs` wrote 13 after-*.png (Dashboard, Gallery, World×3, Room×3 + 1366/1440/1600, Dungeon, Manual Gen) |

---

## Verified functionality (non-regression)

- Nav destinations all mount under shell
- Shortcuts: Ctrl+B, Ctrl+K, Ctrl+1–6
- Status strip / health / concurrency still from live bridge hooks
- P1 Room / World / Dungeon / Gallery / Dashboard structures left intact (class + token inherit only)
- No IPC contract changes; no mocked provider/HW values

---

## Remaining UI issues (defer to P3+)

- Not every screen deeply uses `PropertyRow` / `Metric` / `SegmentedTabs` yet (available; adopt in P3 workspace passes)
- Settings still uses raw `.panel` blocks in places (tokens apply; structure polish = P3)
- Top-bar health can flicker briefly on first load while providers resolve
- Live multi-res eyeball PNGs at 1366 / 1440 / 1920 still recommended after restart of Electron (HMR vs full reload)
- `nvidia-smi` missing on this machine → HW path falls back to RAM (pre-existing)

---

## Screenshots recommended

1. Shell: Dashboard with expanded nav + health badge + status strip (1920)
2. Room Editor (confirm P1 SoT not regressed)
3. Providers + Models (SearchField + cards)
4. Settings loading/error states
5. Collapsed rail at 1366 + breadcrumb truncation

Capture helpers: `tools/redesign-audit/capture-after.mjs`, `tools/redesign-audit/capture.mjs`

---

## P3 readiness

**Ready for P3 workspace deep redesigns** — shared tokens, shell, and primitives are in place. P3 should consume `studio/ui` components per screen without reinventing colors/spacing/shell.

**Do not start P3 in this pass** (stopped here per brief).
