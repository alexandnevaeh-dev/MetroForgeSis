# Cursor workstream status

Branch: `feature/cursor-desktop-studio`  
Worktree: `../Forged-cursor-desktop`  
Agent: CURSOR  
Updated: 2026-08-13 (session 9 — premium UI redesign)

## Completed

- Isolated Cursor git worktree/branch (`feature/cursor-desktop-studio`).
- Dark-first shell and studio screens on canonical IPC.
- Active project context; Create archetypes; Models/Providers; live worker meters.
- World/Dungeon/Room editors with room focus and occupancy overlay.
- Gallery search + Manual Generator prefill.
- QA: doctor refresh, gate filter, skipRuntime, checkpoints, gate jumps.
- Export: dashboard preflight, Play/Open Godot, commercial-safe note.
- Generation Studio: clickable activity, world double-click / open room, artifact → gallery.
- Empty-project hint on project-backed screens; Projects search + active card.
- Ctrl+K palette: screens, projects, rooms, and assets.
- Dungeon AI CommandBar; editor chrome hidden until a project is selected.
- Gallery/room empty-filter states; layout breakpoints for 1920 / 1440 / 1366.
- Consumed Claude spatial/routing IPC (`explainModelRouting`, overworld/dungeon/collision).
- **Premium redesign PHASE 1–5 (partial):** forge token system, layered workspace chrome, top command bar + collapsible nav rail, Create / Dashboard / Generation Studio visual pass.

## In Progress

- UI redesign PHASE 6–11 (Asset Gallery → World/Room/Dungeon → Models/Providers/Routing → QA/Settings → motion polish).

## Next

- Deep-redesign remaining screens on the new panel/token system without inventing backend data.
- Optional screenshot pass under `docs/ui-redesign/` when desktop can be launched for capture.

## Backend Dependencies

See `docs/CURSOR_BACKEND_REQUIREMENTS.md` (spatial/routing items landed on Claude side).

## Tests

- `pnpm --filter @metroforge/desktop typecheck` — passed
- `pnpm --filter @metroforge/desktop build` — passed

## Known Issues

- Spatial world view falls back to graph layout when nodes lack x/y.
- Dungeon editor shows dungeon-like nodes when tagged; otherwise the full world graph.
- Entity markers in the Room Editor are count layout — room records do not include authored x/y.
- `modelId` on events is still a backend gap; UI shows it only when present.
