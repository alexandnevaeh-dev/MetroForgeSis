# MetroForge Routes / Screen Map

Source of truth: `apps/desktop/src/studio/nav.ts`, `apps/desktop/src/App.tsx`.  
There is no URL router — navigation is an in-memory `NavId` (`activeNav` state).

## Global shortcuts

| Shortcut | Action | Source |
|----------|--------|--------|
| `Ctrl+K` / `Cmd+K` | Toggle GoTo palette | `App.tsx` |
| `Ctrl+B` / `Cmd+B` | Collapse / expand sidebar | `App.tsx` |
| `Ctrl+1` … `Ctrl+6` | Jump to shortcut-tagged nav items | `nav.ts` + `App.tsx` |

Top bar also exposes quick actions: **New Game**, **Studio**, **Preview**, **Jump**.

## Nav groups → screens

| Group | NavId | Sidebar label | Shortcut | Component | File |
|-------|-------|---------------|----------|-----------|------|
| Create | `Dashboard` | Dashboard | Ctrl+1 | `ProjectDashboard` | `studio/ProjectDashboard.tsx` |
| Create | `Create` | New Game | Ctrl+2 | `CreateScreen` | `studio/CreateScreen.tsx` |
| Create | `Studio` | Generation Studio | Ctrl+3 | `GenerationStudio` | `studio/GenerationStudio.tsx` |
| Library | `Projects` | Projects | Ctrl+4 | `ProjectsScreen` | `studio/ProjectsScreen.tsx` |
| Library | `Assets` | Asset Gallery | Ctrl+5 | `AssetsGallery` | `studio/AssetsGallery.tsx` |
| Library | `Generate Asset` | Manual Generator | Ctrl+6 | `GenerateAssetScreen` | `studio/GenerateAsset.tsx` |
| World | `World` | World Editor | — | `WorldEditor` | `studio/WorldEditor.tsx` |
| World | `Rooms` | Room Editor | — | `RoomEditor` | `studio/RoomEditor.tsx` |
| World | `Dungeon` | Dungeon Editor | — | `DungeonEditor` | `studio/DungeonEditor.tsx` |
| World | `Preview` | Game Preview | — | `PreviewScreen` | `studio/PreviewScreen.tsx` |
| AI | `Models` | Models | — | `ModelsScreen` | `studio/ModelsScreen.tsx` |
| AI | `Providers` | Providers | — | `ProvidersScreen` | `studio/ProvidersScreen.tsx` |
| AI | `Routing` | Routing Inspector | — | `RoutingInspector` | `studio/RoutingInspector.tsx` |
| AI | `QA` | QA | — | `QAScreen` | `studio/QAScreen.tsx` |
| Ship | `Export` | Export | — | `ExportScreen` | `studio/ExportScreen.tsx` |
| Ship | `Settings` | Settings | — | `SettingsScreen` | `studio/SettingsScreen.tsx` |

## Shell chrome (always mounted)

| Region | Component / markup | File |
|--------|-------------------|------|
| Top bar | `TopCommandBar` | `App.tsx` |
| Project select | `ProjectSelect` | `studio/ProjectSelect.tsx` |
| Sidebar | `NAV_GROUPS` map | `App.tsx` + `nav.ts` |
| Status strip | `StatusBar` | `studio/StatusBar.tsx` |
| Command palette | `GoToPalette` | `studio/GoToPalette.tsx` |

## In-screen modes (not separate NavIds)

| Screen | Modes / tabs | Notes |
|--------|--------------|-------|
| World Editor | Progression / Graph / Spatial | `WorldEditor` local `view` state |
| Room Editor | Visual / Collision / Entities / Navigation / Progression / Debug | `RoomEditor` `LAYERS` |
| Generation Studio | World / Artifact preview tabs + activity filters | `GenerationStudio` |
| Asset Gallery | Category filters (Player, Tileset, Music, …) | `AssetsGallery` |

## Principal screenshot ↔ NavId map

| Screenshot | NavId / mode |
|------------|--------------|
| `01-dashboard.png` | Dashboard |
| `02-new-game.png` | Create |
| `03-generation-studio.png` | Studio |
| `04-projects.png` | Projects |
| `05-asset-gallery.png` | Assets |
| `06-manual-generator.png` | Generate Asset |
| `07-world-editor-progression.png` | World → Progression |
| `08-world-editor-graph.png` | World → Graph |
| `09-world-editor-spatial.png` | World → Spatial |
| `10`–`15-room-editor-*.png` | Rooms → each layer |
| `16-dungeon-editor.png` | Dungeon |
| `17-game-preview.png` | Preview |
| `18-models.png` | Models |
| `19-providers.png` | Providers |
| `20-routing-inspector.png` | Routing |
| `21-qa.png` | QA |
| `22-export.png` | Export |
| `23-settings.png` | Settings |
