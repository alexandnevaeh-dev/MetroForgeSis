# MetroForge P1 Desktop UI — Implementation Plan

Updated: 2026-08-14  
Visual target: Concept A (`docs/ui-redesign/CONCEPT_A_REFERENCE.png`) + **Room Editor SoT** (`docs/ui-redesign/CONCEPT_A_ROOM_EDITOR_REFERENCE.png`) + `redesign-audit/`  
Constraint: **not greenfield** — densify / restructure existing screens only. Preserve IPC, Generation Studio, Routing, Models, Providers, QA, Godot, shortcuts.

## Room Editor SoT (from CONCEPT_A_ROOM_EDITOR_REFERENCE.png)

- View-mode tabs: Visual · Collision · Entities · Navigation · Progression · Debug
- Left: Layers (real overlay channels) · Tools (Select/Paint/Erase) · Tile palette · Rooms
- Dominant canvas + zoom/snap toolbar + bottom canvas status (grid/size from real metadata)
- Right inspector sections: Preview · Room · Contents · Connections · Actions
- Honest empty viewport when no authored geometry — **no fake tiles/enemies/thumbnails**
- App StatusBar remains the global bottom strip (real HW/providers/concurrency)

---

## Real files in scope

| Priority | Path | Role |
|----------|------|------|
| Shared | `apps/desktop/src/studio/ui/index.tsx` (+ `styles.css`) | EditorWorkspace, EditorViewport(+footer), EmptyViewport, EditorToolbar, InspectorSection, ViewModeTabs |
| 1 | `RoomEditor.tsx`, `TilePaintEditor.tsx` | SoT layout; honest empty |
| 2 | `WorldEditor.tsx`, `WorldMapPreview.tsx` | fitView; view-mode tabs |
| 3 | `DungeonEditor.tsx` | Larger graph; real criticalPath/keys |
| 4 | `AssetsGallery.tsx`, `VirtualizedAssetGrid.tsx` | Denser grid; QA/provider badges |
| 5 | `ProjectDashboard.tsx` | Control-center empty/error polish |
| 6 | `GenerateAsset.tsx`, `metroforge-api.ts` | Canonical `GeneratedAssetRef` / `GenerateAssetResponse` |

## IPC (preserve)

Room: `listRooms`, `getRoomCollision`, `updateRoom`, `regenerateRoom`, `getTilesetPreview`, `playInGodot`  
World: `getWorldGraph`, `getOverworldMap`, `updateWorldGraph`, undo/history, checkpoints  
Dungeon: `getWorldGraph`, `getDungeonGraph`  
Gallery / Dashboard / GenerateAsset: existing bridge only — no new channels.

## Preserve

Ctrl+B / Ctrl+K / Ctrl+1–6 · Generation Studio · Routing · Models · Providers · QA · Godot · no fake data.
