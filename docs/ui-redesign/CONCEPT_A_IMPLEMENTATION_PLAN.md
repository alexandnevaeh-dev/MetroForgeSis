# Concept A UI Redesign — Implementation Plan

Updated: 2026-08-14

## Visual target

Premium dark IDE / workstation (Unreal / VS / JetBrains): electric-blue accents (`#258cff`), slate borders, high density. **No** neon glow, glass blur, or oversized SaaS cards.

## Audit map

### Shell (`App.tsx`)

| Region | Behavior | Shortcuts |
|--------|----------|-----------|
| TopBar | Brand, project select + path, New Game / Studio / Preview / Jump | Ctrl+K palette, Ctrl+B sidebar |
| Sidebar | CREATE / LIBRARY / WORLD / AI / SHIP groups from `nav.ts` | Ctrl+1–6 on labeled items |
| Main | One screen mount at a time | — |
| StatusBar | Bridge, nav, project, HW, providers, concurrency, queue | Real IPC only |

### Screens → real data

| Nav | Component | Primary IPC |
|-----|-----------|-------------|
| Dashboard | `ProjectDashboard` | `getProjectDashboard` |
| Create | `CreateScreen` | `generateGame` |
| Studio | `GenerationStudio` | generation events / state / queue |
| Projects | `ProjectsScreen` | `listProjects` |
| Assets | `AssetsGallery` | `listAssets`, usages, history, maturity |
| Manual Gen | `GenerateAsset` | asset generation pipeline |
| World / Rooms / Dungeon | editors | world graph, room, dungeon IPC |
| Preview | `PreviewScreen` | `getProjectPreview`, Godot |
| Models / Providers / Routing | AI screens | `listModels`, `listProviders`, `explainModelRouting` |
| QA / Export / Settings | ship screens | QA, export preflight, `getConfig` / settings |

### Constraints

- Redesign `apps/desktop/src/**` + styles only
- Preserve all IPC contracts and keyboard shortcuts
- No fake data; empty/unavailable states when missing
- Do not mutate GeneratedGames; do not commit unless asked

## Pass checklist

1. **Tokens + primitives + AppShell** — Concept A CSS vars, Button/Input/Panel/Badge/Tabs/DataTable/EmptyState, denser TopBar/Sidebar/StatusBar
2. **Dashboard + Studio + Projects** — Concept A summary/timeline/env/checkpoints/recent/quick-launch; studio 3-pane + activity; projects density
3. **Asset Gallery + Manual Generator** — toolbar, grid density, maturity inspector; compact generator columns
4. **World / Room / Dungeon + Preview** — 3-region shell, fill canvas, no fake tools
5. **Models + Providers + Routing** — table+inspector, health cards, real routing explain
6. **QA + Export + Settings** — section polish
7. **Responsive 1366–1920+, a11y, empty states, consistency**

## Strategy

Prefer token/alias remapping + shared primitives + denser layout CSS over page rewrites. Touch screen JSX only where Concept A structure requires it (Dashboard shell, EmptyState, sidebar tooltips).
