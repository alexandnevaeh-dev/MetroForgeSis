# Room 05 ability shrine — representative visual target

The Foundry slice is **rejected as a finished visual product**. MASS / LARGE / RC stay **blocked**. Do not merge.

This folder is **room 05 only**. Do not treat palette-tinted block actors as courier art. Do not propagate this treatment to other rooms until this shrine still is reviewed.

## Generation

| Field | Value |
|---|---|
| Code | `1c78b42` (recessed furnace interior + NPC desaturate) on `cursor/foundry-visual-recapture-acbb` |
| Slug | `foundry-visual-slice-pr2` |
| Prompt | A courier in a furnace foundry, orange claw enemy, 32px industrial kit, side-view metroidvania |
| Profile | `VISUAL_VERTICAL_SLICE` |
| Mode | `LOCAL_ONLY` |
| Seed | `20260909` |
| Godot | `4.7.1.stable.official.a13da4feb` |
| Viewport | 1920×1080 |
| Driver | `opengl3` (windowed) |
| `visualSliceApproved` | `false` (`VISUAL_SLICE_REJECTED`) |

Camera framing (`zoom=2.40 view=800×450 center=400,555`) and compact HUD are **unchanged**. Pickup cream outline (`outline_width` 1.0) is unchanged.

## Furnace interior (this pass)

Room 05 only. Collision, other rooms, gate input, and critic thresholds were not changed.

- **Cavity:** near-black recessed mouth. Not a full-mouth orange gradient rectangle.
- **Coal bed:** irregular pixel coals and sparse orange cores along a narrow sill band, with a left keepout so the pickup is not on the fire.
- **Grate + rim:** 3px vertical bars, a sill grate, and an enclosing iron rim.
- **Local light:** smaller hearth/sill `PointLight2D`s on Ground only. RearWall stays unlit by those lights.
- **Ability pickup:** 1px cream outline + small halo on a dark cavity, not a bright orange slab.
- **NPC block:** source sheet `npc_000.png` is a solid mustard cube. Multiplicative modulate cannot desaturate it. This pass strips hue with a shrine-only shader and `light_mask = 0`. Measured in the new still: NPC bbox avg **(73, 68, 65)**, saturation ~0.09 (was mustard ~200,155,40). Still a placeholder actor, not courier art.

## Evidence

- Prior shrine still (camera/HUD, empty firebox): [05_ability_shrine_fullres.png](05_ability_shrine_fullres.png)
- Prior lighting still (orange slab): [05_ability_shrine_lighting.png](05_ability_shrine_lighting.png)
- Furnace interior still: [05_ability_shrine_furnace_interior.png](05_ability_shrine_furnace_interior.png)
- Lighting vs furnace side by side: [05_ability_shrine_before_after_furnace.png](05_ability_shrine_before_after_furnace.png)
- Gameplay (prior clip; stays in room 05): [room05_ability_traversal_and_pickup.mp4](room05_ability_traversal_and_pickup.mp4)

## Checks (thresholds not weakened)

| Gate | Result |
|---|---|
| Playtest | **8/8 PASS** (unchanged; not re-run this pass) |
| Runtime smoke (windowed) | shrine still **visible** PASS; shrine telemetry `zoom=2.40 view=800x450 center=400,555` |
| `gameplay_screenshot_qa` (spawn `qa/screenshot_gameplay.png`) | **FAIL score 40** wallpaper/low-contrast (occupancy ~0.98, lumaStdDev ~6.6) |
| Shrine furnace still through the same critic | score **100** (occupancy ~0.36, lumaStdDev ~8.0) — informational; the gate still scores spawn |

Do not relax `gameplay_screenshot_qa` because the shrine still scores 100.
