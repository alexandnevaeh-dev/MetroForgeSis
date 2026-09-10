# Room 05 ability shrine — representative visual target

The Foundry slice is **rejected as a finished visual product**. MASS / LARGE / RC stay **blocked**. Do not merge.

This folder is **room 05 only**. Do not treat palette-tinted block actors as courier art. Do not propagate this treatment to other rooms until this shrine still is reviewed.

## Generation

| Field | Value |
|---|---|
| Code | `a535775` (shrine lighting/readability) on `cursor/foundry-visual-recapture-acbb` |
| Slug | `foundry-visual-slice-pr2` |
| Prompt | A courier in a furnace foundry, orange claw enemy, 32px industrial kit, side-view metroidvania |
| Profile | `VISUAL_VERTICAL_SLICE` |
| Mode | `LOCAL_ONLY` |
| Seed | `20260909` |
| Godot | `4.7.1.stable.official.a13da4feb` |
| Viewport | 1920×1080 |
| Driver | `opengl3` (windowed) |
| Job | `job_mtv3kqmh_dydovr` |
| `visualSliceApproved` | `false` (`VISUAL_SLICE_REJECTED`) |

Camera framing (`zoom=2.40 view=800×450 center=400,555`) and compact HUD are **unchanged** from the prior shrine pass.

## Lighting / readability (this pass)

Room 05 only. Collision, other rooms, gate input, and critic thresholds were not changed.

- **Furnace mouth:** hot interior (dark cavity → coals at the sill) plus localized ember PointLights on Ground. RearWall does not receive those lights.
- **Ability pickup:** 1px outline + small halo; sits in the firebox so it is the small focal point.
- **Walkable surfaces:** Ground stays lit; RearWall is darker and unlit so floor/platforms separate from the hearth.
- **Yellow NPC block:** muted modulate so it no longer dominates; still visible as a placeholder actor. Not courier art.

## Evidence

- Prior shrine still (camera/HUD, empty firebox): [05_ability_shrine_fullres.png](05_ability_shrine_fullres.png)
- Lighting still: [05_ability_shrine_lighting.png](05_ability_shrine_lighting.png)
- Side by side: [05_ability_shrine_before_after_lighting.png](05_ability_shrine_before_after_lighting.png)
- Gameplay (prior clip; stays in room 05): [room05_ability_traversal_and_pickup.mp4](room05_ability_traversal_and_pickup.mp4)

## Checks (thresholds not weakened)

| Gate | Result |
|---|---|
| Playtest | **8/8 PASS** |
| Runtime smoke (windowed) | shrine still **visible** PASS |
| `gameplay_screenshot_qa` (spawn `qa/screenshot_gameplay.png`) | **FAIL score 40** wallpaper/low-contrast |
| Shrine lighting still through the same critic | score **100** (occupancy ~0.48, lumaStdDev ~12.6) — informational; the gate still scores spawn |

Do not relax `gameplay_screenshot_qa` because the shrine still scores 100.
