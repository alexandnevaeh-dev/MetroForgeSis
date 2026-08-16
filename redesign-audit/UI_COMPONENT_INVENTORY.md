# MetroForge UI Component Inventory

Read-only inventory from `apps/desktop/src/**` (Concept A shell + studio screens).  
Shared = reused across screens; Specific = primarily one screen.

## APP SHELL

| Component | File | Screens | Shared? | Visual responsibility |
|-----------|------|---------|---------|------------------------|
| `App` / shell grid | `App.tsx` | all | Shared | TopBar + Sidebar + Main + StatusBar layout |
| `TopCommandBar` | `App.tsx` | all | Shared | Brand, hamburger, project path, New Game / Studio / Preview / Jump |
| `ProjectSelect` | `studio/ProjectSelect.tsx` | all (topbar + some screens) | Shared | Active project dropdown |
| Sidebar nav | `App.tsx` + `studio/nav.ts` | all | Shared | Grouped nav items, active state, collapsed abbrev rail |
| `StatusBar` | `studio/StatusBar.tsx` | all | Shared | Version, nav, project, HW, VRAM, providers, worker meters, Idle |
| `GoToPalette` | `studio/GoToPalette.tsx` | overlay | Shared | Ctrl+K jump palette |
| `StudioProvider` | `studio/StudioContext.tsx` | all | Shared | Active project + navigation helpers |
| `ConcurrencyMeters` | `studio/ConcurrencyMeters.tsx` | status | Shared | LLM/IMG/AUD/CPU meters |

## NAVIGATION

| Piece | Source | Notes |
|-------|--------|-------|
| Groups CREATE / LIBRARY / WORLD / AI / SHIP | `nav.ts` | Labels uppercase via CSS |
| Selected state | `.nav-item.active` | `--nav-active-bg` + left accent bar |
| Shortcuts Ctrl+1–6 | `nav.ts` `shortcut` fields | Shown in expanded sidebar |
| Collapsed rail | `.app.sidebar-collapsed` | Two-letter `data-abbrev` labels |
| Topbar Jump | `TopCommandBar` | Opens palette |

## SHARED CONTENT PRIMITIVES (`studio/ui/index.tsx`)

| Component | Visual role | Used by (examples) |
|-----------|-------------|--------------------|
| `Button` | `.mf-btn` variants primary/ghost/danger | Dashboard, Studio, Routing, QA, Export, … |
| `Input` / `Select` | `.mf-input` / `.mf-select` | Studio request bar, filters, Settings |
| `Panel` | Panel L0/L1/L2 shells + optional header | Most screens |
| `Badge` | Tone chips (success/warn/danger/info) | Studio phases, Providers, QA, Routing |
| `Tabs` | Tablist using `.tab` | Routing / gallery / editors (also raw `.tab` buttons) |
| `EmptyState` | Intentional empty panel | Dashboard, editors, gallery, routing |
| `DataTable` | `.mf-data-table` / provider table wrap | Models, Routing candidates, Dashboard recent |
| `DensityGrid` | CSS grid with `--mf-grid-min` | Dense card layouts |

## SHARED SCREEN CHROME

| Component | File | Shared? | Notes |
|-----------|------|---------|-------|
| `ScreenHeader` | `studio/ScreenHeader.tsx` | Shared | Eyebrow + title + description + actions |
| `NoProjectHint` | `studio/NoProjectHint.tsx` | Shared | Empty when no active project |
| `CommandBar` | `studio/CommandBar.tsx` | World/Room/Dungeon | Natural-language editor commands + mic |
| `EditStatusBadge` | `studio/EditStatusBadge.tsx` | Editors | CLEAN / dirty style badge |
| `AllowPlaceholdersControl` | `studio/AllowPlaceholdersControl.tsx` | Generation-related | Placeholder policy control |
| `MediaPreviews` | `studio/MediaPreviews.tsx` | Assets / preview | Image/audio preview helpers |

## MAJOR SCREEN COMPONENTS

| Screen | Primary component | File | Notable children |
|--------|-------------------|------|------------------|
| Dashboard | `ProjectDashboard` | `ProjectDashboard.tsx` | Timeline/Environment/Checkpoints KPIs, recent table, quick launch, system log |
| New Game | `CreateScreen` | `CreateScreen.tsx` | Prompt + profile form → `generateGame` |
| Generation Studio | `GenerationStudio` | `GenerationStudio.tsx` | Request bar, phase timeline, World/Artifact preview, task inspector, activity stream, `GenerationQueuePanel` |
| Projects | `ProjectsScreen` | `ProjectsScreen.tsx` | Project list/table from `listProjects` |
| Asset Gallery | `AssetsGallery` | `AssetsGallery.tsx` | Category bar, `VirtualizedAssetGrid`, asset inspector, maturity badges |
| Manual Generator | `GenerateAssetScreen` | `GenerateAsset.tsx` | Foundry form + inspector; `AssetProductionGatePanel` |
| World Editor | `WorldEditor` | `WorldEditor.tsx` | Progression/Graph/Spatial tabs, `WorldMapPreview`, inspector, CommandBar |
| Room Editor | `RoomEditor` | `RoomEditor.tsx` | Layers list, tools grid, rooms list (`VirtualizedRoomList`), `TilePaintEditor`, inspector |
| Dungeon Editor | `DungeonEditor` | `DungeonEditor.tsx` | Dungeon graph + room inspector |
| Game Preview | `PreviewScreen` | `PreviewScreen.tsx` | Preview payload / Godot actions (`godot-actions.ts`) |
| Models | `ModelsScreen` | `ModelsScreen.tsx` | Hardware summary + model table + inspector |
| Providers | `ProvidersScreen` | `ProvidersScreen.tsx` | Health cards, env key presence, provider table |
| Routing Inspector | `RoutingInspector` | `RoutingInspector.tsx` | Request/Selected/Fallbacks, candidates/rejected tables, QA health log |
| QA | `QAScreen` | `QAScreen.tsx` | Environment + project gates + checkpoints |
| Export | `ExportScreen` | `ExportScreen.tsx` | Preflight / readiness / export actions |
| Settings | `SettingsScreen` | `SettingsScreen.tsx` | Preferences, worker pool, env paths, API key status |

## EDITOR-SPECIFIC VISUALS

| Component | File | Screens | Shared? | Notes |
|-----------|------|---------|---------|-------|
| `WorldMapPreview` | `WorldMapPreview.tsx` | World | Specific | SVG/canvas graph nodes & edges |
| `TilePaintEditor` | `TilePaintEditor.tsx` | Room | Specific | Canvas + tile palette docking |
| `VirtualizedRoomList` | `VirtualizedRoomList.tsx` | Room | Specific | Room list virtualization |
| `VirtualizedAssetGrid` | `VirtualizedAssetGrid.tsx` | Assets | Specific | Asset card grid virtualization |
| Layer / tool buttons | markup in `RoomEditor.tsx` | Room | Specific | Visual→Debug layers; VIS/COL/… tools |
| Dungeon graph UI | `DungeonEditor.tsx` | Dungeon | Specific | Room graph + locks |

## DUPLICATION / CONSISTENCY NOTES

1. **Tabs**: both `ui.Tabs` and raw `button.tab` patterns coexist (World/Room/Studio).
2. **Panels**: mix of `Panel` primitive and hand-written `.panel` / `.panel-l1` markup.
3. **Project selectors**: topbar `ProjectSelect` plus in-screen project dropdowns (Studio, Dashboard).
4. **Status colors**: Badge tones + `.status-dot` + check-pass/warn classes — same tokens, multiple class systems.
5. **Empty states**: `EmptyState` primitive used in places; other screens use inline hint text in large empty canvases.

## STYLING ENTRYPOINTS

| File | Role |
|------|------|
| `tokens.css` | Design tokens |
| `styles.css` | Global + screen layout CSS (~2.3k lines) |
| `studio/ui/index.tsx` | Primitive classNames (`mf-*`) |
