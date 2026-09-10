# Visual slice acceptance — automated vs human

This is the review checklist for the Foundry visual vertical slice. Automated
gates can pass while the slice is still rejected as a finished look.

Studio approval is **human-only**: Generation Studio → **Approve Visual Direction**.
Do not set `visualSliceApproved: true` because screenshot QA or playtest is green.
MASS / LARGE / RELEASE_CANDIDATE stay blocked until that gate is true.

## Automated (CI / runtime)

These are technical checks, not art approval.

| Check | What it measures | This slice |
|---|---|---|
| `gameplay_screenshot_qa` | Occupancy, lumaStdDev, HUD-band fill, wallpaper heuristic on `qa/screenshot_gameplay.png` | Must stay **PASS** (thresholds unchanged) |
| `godot_playtest` 8 cases | Traversal, rooms 000–009, `gameComplete` | Must stay **8/8 PASS** |
| Sprite contracts | 64×64 stills, 256×64 4-frame sheets, feet-bottom offset | Required |
| Collision | Player 24×48 at `(0,-24)`; NPC 28×52 at `(0,-26)` | Must not change |
| Camera telemetry | Tutorial spawn `zoom=2.40 view=800x450 center=400,375`; shrine `center=400,555` | Must not regress |
| Asset maturity | Procedural fallback ⇒ `PLACEHOLDER`. Authored courier ⇒ `QA_REVIEW` | Actors only |
| `placeholderRatio > 0.6` | Hard-fail in `scoreVisualQuality` | Still expected until MASS art |

Thresholds in `packages/assets/src/scene-critic.ts` / `packages/qa/src/visual-quality.ts` were **not** changed.

## Human (Approve Visual Direction)

Rubric: `artCoherence`, `playerReadability`, `environmentCoherence`, `tilesetQuality`,
`animationQuality`, `lightingDepth`, `combatReadability`, `vfxIntegration`,
`roomComposition`, `hud`, `bossPresentation`, `overallPolish`
(`packages/schemas/src/visual-slice.ts`).

Reviewers should look at:

1. **Player vs NPC roles** — Wanderer (visor, pack, blade) vs foundry tender (apron, lantern). Same soot-iron/brass language, not a recolor of one silhouette.
2. **Walk/attack poses** — distinct frames, not a 1px bob of a still.
3. **Room 05 furnace** — recessed cavity, coal bed, grate, rim (preserved).
4. **Pickup** — cream outline, readable on soot.
5. **Tutorial spawn framing** — playable band, darkened far plate (preserved).
6. Remaining **PLACEHOLDER** kit: enemies, boss, tiles, VFX, HUD chrome. These are MASS-gated and are still blockers for calling the slice production-ready.

Passing automated QA is recorded as `AUTOMATED_VISUAL_PASS_HUMAN_REVIEW_REQUIRED`, never as approval.
