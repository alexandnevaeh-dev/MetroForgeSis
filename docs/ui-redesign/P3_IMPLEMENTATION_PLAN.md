# MetroForge P3 — World-Building Workspaces Plan

**Date:** 2026-08-14  
**Constraint:** Continue P1/P2. Do not restart architecture, duplicate screens, or change IPC unless fixing UI wiring. No fake map/room data. Stop after P3.

**Visual SoT:** `CONCEPT_A_REFERENCE.png`, `CONCEPT_A_ROOM_EDITOR_REFERENCE.png`, `--forge-*` tokens.

---

## STEP 0 — Audit (existing)

| Area | Location | Notes |
|------|----------|--------|
| WorldEditor | `studio/WorldEditor.tsx` | Progression/Graph/Spatial + CommandBar; edit panels still below canvas |
| RoomEditor | `studio/RoomEditor.tsx` | Concept A layout; Erase UI not wired into TilePaintEditor |
| DungeonEditor | `studio/DungeonEditor.tsx` | getDungeonGraph + WorldMapPreview; locked edges amber; critical path list only |
| PreviewScreen | `studio/PreviewScreen.tsx` | Godot actions + map + asset grid; no inspector column |
| TilePaintEditor | `studio/TilePaintEditor.tsx` | Paint/save only — needs erase mode prop |
| WorldMapPreview | `studio/WorldMapPreview.tsx` | fitView, spatial x/y, locked edges; no critical-path stroke |
| AI CommandBar | `studio/CommandBar.tsx` | Used by World/Room/Dungeon — compact height via CSS |
| Shared UI | `studio/ui/index.tsx` | EditorWorkspace/Toolbar/Viewport/EmptyViewport/InspectorSection/ViewModeTabs from P1/P2 |
| Tokens | `tokens.css` + `styles.css` | `--forge-*`; need `--canvas-*` aliases |

**Project for screenshots:** prefer wind-swept if present; else richest available (`GeneratedGames/nvidia-image-activation-smoke` when wind-swept missing).

---

## P3.1 Shared EditorWorkbench

Evolve `studio/ui/index.tsx` (aliases + thin wrappers where 2+ screens need them):

- `EditorWorkbench` → `EditorWorkspace`
- `EditorCanvas` → `EditorViewport`
- `EditorSection` → `InspectorSection` / `PropertySection`
- `EditorPropertyRow` / `EditorPropertyGroup`
- `EditorDock`, `EditorTabs`, `EditorToolButton`
- `EditorEmptyState`, `EditorZoomControls`, `EditorStatusBadge`
- Keep existing exports for P1/P2 callers

## P3.2 World Editor

- Compact header + CommandBar ~40–44px
- View modes stay professional tabs; canvas dominates
- Spatial: honest sparse messaging from `getOverworldMap` / real x,y — no fake rooms
- Inspector: GENERAL / CONNECTIONS / PROGRESSION / ACTIONS
- Bottom dock tabs Structure | Connections | Checkpoints (same handlers)

## P3.3 Room Editor

- Left hierarchy denser (SearchField, compact rows)
- Wire Erase → TilePaintEditor `tool` prop
- Dominant canvas + pixelated; palette dock lower/left
- Expand collision/entities/nav/progression; debug = monospace JSON
- Inspector sections preserved; honest empty geometry

## P3.4 Dungeon Editor

- Majority graph; pass criticalPath + locked/boss styling from real data
- Room list + inspector; Open in Room Editor

## P3.5 Game Preview

- Not fake playable window
- Play / Open Godot / World / Gallery
- Large topology + asset grid + inspector (real provenance)

## P3.6–3.12

- `--canvas-bg` etc → forge; inspector 280–320px; empty states; responsive 1920/1600/1366/~1100; 120–180ms motion + `prefers-reduced-motion`; a11y; no backdrop-filter spam; keep virtualization

## P3.14–16

- Screenshots → `redesign-audit/screenshots/p3/` (or docs fallback)
- Functional smoke of listed interactions
- typecheck + desktop build; fix P3 regressions only

## Out of scope

P4+ screens, IPC/backend redesign, commits.
