# MetroForge Desktop — Current UI Audit Brief (for ChatGPT redesign)

**How to use:** Paste this whole file into ChatGPT. Attach the images in `docs/ui-audit/layouts/` (SVG schematics). Replace schematics with real screenshots when you have them (see bottom).

**App:** MetroForge — Electron + React desktop AI game generator (side-view Metroidvania + top-down action adventure).  
**Stack:** `apps/desktop` React renderer, CSS design tokens in `styles.css`, IPC via `window.metroforge`.  
**Do not invent backend data.** Redesign must keep real generation events, models, world graph, rooms, assets, QA, Godot actions.

---

## 1. Product feel target (desired redesign)

Premium futuristic forge: blackened steel / obsidian / graphite + cyan / electric blue + controlled violet + molten amber.  
AAA game editor × AI creative suite × IDE × world-building tool.  
**Not:** generic SaaS purple, neon cyberpunk overload, cartoon sci-fi, fake mock data.

---

## 2. App shell (current)

```
┌──────────────────────── TOP COMMAND BAR (48px) ─────────────────────────┐
│ [≡] MF MetroForge  | ProjectSelect + path | New Game · Studio · Preview · Jump Ctrl+K │
├──────────┬──────────────────────────────────────────────────────────────┤
│ SIDEBAR  │                                                              │
│ 220px    │                    MAIN WORKSPACE                            │
│ (64px    │                    (one screen at a time)                    │
│ collapsed│                                                              │
│ Ctrl+B)  │                                                              │
├──────────┴──────────────────────────────────────────────────────────────┤
│ STATUS BAR (28px): bridge · nav · project · HW · providers · workers · queue │
└─────────────────────────────────────────────────────────────────────────┘
```

**Schematic:** `layouts/00-app-shell.svg`

### Left nav groups (exact labels)

| Group | Items | Shortcuts |
|-------|--------|-----------|
| Create | Dashboard, New Game, Generation Studio | Ctrl+1–3 |
| Library | Projects, Asset Gallery, Manual Generator | Ctrl+4–6 |
| World | World Editor, Room Editor, Dungeon Editor, Game Preview | — |
| AI | Models, Providers, Routing Inspector, QA | — |
| Ship | Export, Settings | — |

### Top bar actions
- Toggle nav collapse  
- Brand mark `MF` + version  
- Compact project picker + truncated path  
- New Game / Studio / Preview / Jump (Ctrl+K)

### Status bar
Bridge status · active nav · project (→ Dashboard) · hardware (→ Models) · providers · concurrency meters (→ Settings) · generation queue (→ Studio)

### Global overlays
- **GoTo palette (Ctrl+K):** screens, projects, rooms, assets — keyboard arrows/Enter, Tab trap  
- Skip link to `#studio-main`

---

## 3. Design tokens (current — already partially redesigned)

```css
--bg-root: #07090c;
--bg-panel: #0e1218;
--bg-panel-elevated: #141a22;
--accent-cyan: #38bdf8;
--accent-blue: #3b82f6;
--accent-violet: #8b7cf6;
--accent-amber: #e8a54b;
--success: #5fbf88;
--warning: #e8a54b;
--danger: #e07a6a;
--topbar-h: 48px;
--sidebar-w: 220px;
--sidebar-w-collapsed: 64px;
--status-h: 28px;
--inspector-w: 280px;
```

Panel tiers in CSS: `panel-l1`, `panel-l2`, `panel-l3`.  
Fonts: Segoe UI Variable / IBM Plex Sans; Cascadia Code / JetBrains Mono for paths/IDs.

Breakpoints of interest: 1920, 1440, 1366, 1100 (editors stack).

---

## 4. Screen-by-screen layouts

### A. Create / New Game — `layouts/01-create.svg`
```
[Hero: Commission a game]
[Archetype card] [Archetype card]   ← Side-view | Top-down
[Large prompt textarea]
[Profile] [Mode] [Seed] [Generate Game]
[Live phase log]
[Result → Studio / Dashboard / Open Godot / Play]
```
**Data:** `generateGame({ prompt, profile, mode, seed, archetype })`

---

### B. Project Dashboard — `layouts/02-dashboard.svg`
```
Header + ProjectSelect + Refresh
Stat cards grid:
  Title/progress | World counts | Completion checklist | Assets & QA
  Project Memory (RAG) | Playtest (clickable rooms) | Action buttons
Recent Activity list → Generation Studio
```
**Data:** `getProjectDashboard` — rooms, completion, playtest, memory, events  
**Actions:** Play Godot, acceptance, reveal folder, jump to Studio/World/Assets/Rooms/QA

---

### C. Generation Studio (hero) — `layouts/03-generation-studio.svg`
```
[Prompt bar: prompt · archetype · profile · mode · control · seed · Generate]
Optional review gate banner (interactive mode)

┌ Timeline ─┬── Live preview (world|artifact) ──┬ Task inspector ─┐
│ phases    │  world graph / artifact image      │ task/phase/model │
│ progress  │  open room                         │ Play / Godot     │
└───────────┴────────────────────────────────────┴─────────────────┘
┌ Activity filters + search + Reload · clickable events · QA panel · Queue ┐
```
**Data:** live `onGenerationEvent`, `onGenerationProgress`, review pause/resume, `getWorldGraph`, artifacts  
**Must keep:** real events only — no fake timeline animation pretending work.

---

### D. Projects library
Searchable project cards, active highlight, New Game empty state, refresh template, export, open.

---

### E. Asset Gallery — `layouts/04-asset-gallery.svg`
```
Search + category tabs (Player NPC Enemy Boss Tileset … Music SFX)
┌ Virtualized grid ──────────────┬ Inspector ─────────────┐
│ thumbnails                     │ preview / anim / audio │
│                                │ path QA usages history │
│                                │ → Manual Generator     │
└────────────────────────────────┴────────────────────────┘
```
Empty states: no project / no assets / no filter matches.

---

### F. Manual Asset Generator
```
┌ Form (prompt, type, mode, seed, variants) ──┬ Preview / history / usages ┐
│ FORGE / generateAsset                       │ restore versions           │
└─────────────────────────────────────────────┴────────────────────────────┘
```

---

### G. World Editor — `layouts/05-world-editor.svg`
```
AI CommandBar
Tabs: Progression | Graph | Spatial/overworld
┌ Canvas (WorldMapPreview) ──────────────┬ Inspector + Open Room ┐
└────────────────────────────────────────┴───────────────────────┘
Panels: Add room · Connect/Disconnect · Checkpoints
```
**Spatial:** prefers `getOverworldMap`; falls back to node metadata x/y.

---

### H. Room Editor — `layouts/06-room-editor.svg`
```
AI CommandBar (selectedRoomId)
┌ Room list+filter ┬ Canvas (layers + tile paint) ┬ Inspector ┐
└──────────────────┴─────────────────────────────┴───────────┘
```
**Collision:** `getRoomCollision` rects when present; else `tileCells` occupancy.

---

### I. Dungeon Editor — `layouts/07-dungeon-editor.svg`
```
AI CommandBar
┌ Room palette + dungeonId ┬ Graph canvas ┬ Inspector / locks / critical path ┐
```
**Data:** `getDungeonGraph` or filtered world graph.

---

### J. Game Preview
World map + asset preview grid → open room / open asset.

---

### K. Models / Providers / Routing — `layouts/08-models-routing-qa.svg`
- **Models:** filters | virtualized table | detail + scout/download + hardware  
- **Providers:** health cards grid  
- **Routing:** capability select → selected / candidates / rejected via `explainModelRouting` (inferred fallback if missing)

---

### L. QA
3 columns: Environment doctor | Project gates (filter + acceptance) | Checkpoints  
Gate rows jump to related screens.

---

### M. Export
Preflight from dashboard · force/zip/commercial-safe · Export · Reveal · Play · Open Godot

---

### N. Settings
Default mode/profile · Godot path · concurrency LLM/image/audio/CPU · live meters

---

## 5. Shared patterns to preserve

| Pattern | Behavior |
|---------|----------|
| `NoProjectHint` | Empty state → New Game / Projects when no active project |
| `ScreenHeader` | eyebrow · title · description · actions |
| `CommandBar` | AI text + mic → `executeAiCommand` |
| `WorldMapPreview` | graph/progression/spatial; click select; double-click / Enter activate |
| `ProjectSelect` | compact + full |
| Primary button | cyan CTA — use sparingly |

---

## 6. What already feels “premium” vs gaps

**Landed (2026-08-13 redesign pass):** full forge token system (obsidian/cyan/amber), top command bar + collapsible rail (Ctrl+B), layered panels L0–L3 + grid/vignette backdrop, Create / Dashboard / Generation Studio visually refreshed (IPC behavior preserved: review gates, live progress, activity). Desktop typecheck + build passed.

**Still functional but less cinematic (next redesign phases):** Asset Gallery, World/Room/Dungeon canvases, Models table, Providers, Routing, QA checklists, Export/Settings forms, iconography (collapsed nav uses text abbreviations), motion polish.

---

## 7. Redesign constraints for ChatGPT

1. Keep all screens and IPC-backed actions.  
2. Generation Studio must remain the hero — timeline + live canvas + inspector + activity.  
3. Do not populate fake assets/events.  
4. Desktop-first: 1920 / 1600 / 1440 / 1366.  
5. Accessibility: contrast, focus rings, keyboard, `prefers-reduced-motion`.  
6. Prefer CSS tokens over one-off colors.  
7. Icons: one family only if adding icons.  
8. Output: CSS + React component structure suggestions mapped to existing screens above.

---

## 8. Suggested ChatGPT prompt (copy after this brief)

> Using the MetroForge UI audit above and the attached layout schematics, propose a premium visual redesign for the Electron React desktop app. Start with design tokens + app shell, then Create, Dashboard, Generation Studio. Give concrete CSS variable values, shell wireframes, and component hierarchy that map to the existing screens. Do not invent backend APIs. Keep Ctrl+K, Ctrl+1–6, Ctrl+B. Avoid generic purple SaaS and neon cyberpunk.

---

## 9. Real screenshots (replace schematics when available)

App was not running when this pack was generated. To capture live shots:

```powershell
# from repo root
pnpm dev:desktop
# Then screenshot each nav screen into docs/ui-audit/screenshots/
# Suggested names:
# before-shell.png, before-create.png, before-dashboard.png,
# before-studio.png, before-assets.png, before-world.png,
# before-rooms.png, before-dungeon.png, before-models.png,
# before-routing.png, before-qa.png, before-settings.png
```

Open `docs/ui-audit/index.html` in a browser to review all layout schematics in one place.
