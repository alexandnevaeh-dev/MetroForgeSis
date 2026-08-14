# MetroForge UI redesign notes

Updated: 2026-08-13 (Cursor)

## Direction

Blackened steel / obsidian / graphite surfaces with cyan–electric blue primary accents, controlled violet, and molten amber for secondary emphasis. Avoid generic SaaS purple and neon cyberpunk.

## Landed

- Design tokens in `apps/desktop/src/styles.css` (`--bg-root` … panel tiers L0–L3, glow/shadow/radius/space, motion).
- App shell: top command bar, collapsible left rail (Ctrl+B), status strip, layered grid/vignette backdrop.
- Screens visually refreshed: Create, Dashboard, Generation Studio (functionality preserved).
- Shortcuts preserved: Ctrl+K palette, Ctrl+1–6 nav, skip link.

## Remaining

- Asset Gallery, World/Room/Dungeon editors, Models/Providers/Routing, QA/Settings, Export.
- Motion polish pass + optional screenshots.

## Notes

- No `docs/ui-audit/` screenshots were available; redesign based on live source.
- Backend/IPC untouched except a null-safe `nodes?.find` in DungeonEditor for typecheck.
