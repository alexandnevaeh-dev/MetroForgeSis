# MetroForge UI redesign notes

Updated: 2026-08-14 (Pass 10 — remaining Concept A deltas)

## Direction

Concept A: premium dark IDE/workstation (Unreal/VS/JetBrains). Electric blue `#258cff`, slate borders, high density. No neon glow, glass blur, or oversized cards.

Visual source of truth: `docs/ui-redesign/CONCEPT_A_REFERENCE.png` (approved Concept A design board).

## Concept A image alignment

Closed largest gaps vs the board (Dashboard / Room Editor / status strip / sidebar / density) plus remaining Routing/QA / tile palette / callouts B·C·E:

- **Sidebar (A)** — Group labels kept; selected item uses solid blue fill (`--nav-active-bg`) + full-height left accent bar
- **Dashboard** — Timeline + Environment + Checkpoints KPI row; Recent Projects table (`listProjects`); Quick Launch list with shortcut hints; System Log + Open Providers; real IPC only
- **Room Editor** — Left rail: Layers + Tools + **docked Tile Palette** + Rooms; center filled canvas + zoom + Play Preview; right inspector with mini preview + room props
- **Tile Palette** — Permanently docked in left rail when a room is selected; interactive only on Visual layer; empty state when `getTilesetPreview` has no atlas
- **Routing Inspector** — Top: Request / Selected / Fallbacks; bottom two-pane: Candidates | Rejected + QA Health log (`explainModelRouting` + `runDoctor`); footer Run quick validation → QA + Export
- **QA** — Two-pane Environment (Overall Status + health log + checkpoints) | Project gates; real doctor / validation / acceptance only
- **Callout B** — Asset inspector denser preview + dl + usage chips + full-width Manual Generator CTA
- **Callout C** — Pipeline timeline FAILED/CANCELLED rows highlighted with danger Badge styling
- **Callout E** — Providers Environment summary + denser health cards + key-presence Health log (live `listProviders` / `getConfig`)
- **Status strip (G)** — `version | nav | project | HW | VRAM/RAM | providers | LLM/IMG/AUD/CPU | Idle | Ctrl+K to Jump`
- **Density** — 4–6px radius tokens, tighter gutters (~0.45rem), thin scrollbars globally

### Remaining deltas vs board

- Board mock radar/chart in Fallbacks panel not reproduced (no fake viz; list fallbacks only)
- Optional screenshot refresh still pending (`pnpm capture:ui`)
- Live visual QA at 1366 / 1440 / 1920 after electron run
- Mock copy/values from the board are intentionally not copied when live IPC differs

## Landed

- Tokens in `apps/desktop/src/tokens.css` + aliases mapped for existing classes
- Shared primitives: `apps/desktop/src/studio/ui/` (Button, Input, Panel, Badge, Tabs, DataTable, EmptyState)
- App shell: solid TopBar/Sidebar/StatusBar; collapsible rail with shortcut tooltips (Ctrl+B); Ctrl+K / Ctrl+1–6 preserved
- Dashboard Concept A layout: Timeline/Environment/Checkpoints, recent projects table, quick launch, system log, checklist, playtest
- Gallery / Manual Generator / Providers / Settings / editors densified; maturity badges; empty states
- Plan: `docs/ui-redesign/CONCEPT_A_IMPLEMENTATION_PLAN.md`

## Remaining

- Optional screenshot refresh: `pnpm capture:ui` (+ `pnpm capture:ui-contact`) under `docs/ui-audit/`
- Live visual QA at 1366 / 1440 / 1920 after electron run

## Notes

- Run desktop: `pnpm --filter @metroforge/desktop typecheck` then `pnpm --filter @metroforge/desktop build` or repo `pnpm dev:desktop`
- No fake data added; no commit in Concept A alignment passes
