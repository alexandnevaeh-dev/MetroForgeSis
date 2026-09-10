# Room 05 ability shrine — representative visual target

The Foundry slice is **rejected as a finished visual product**. MASS / LARGE / RC stay **blocked**. Do not merge.

This folder is **room 05 only**. Do not treat palette-tinted block actors as courier art. Do not propagate this camera/furnace treatment to other rooms until this shrine still is reviewed.

## Generation

| Field | Value |
|---|---|
| Code | `dd84390` (`pin ability-shrine camera to the floor plate`) on `cursor/foundry-visual-recapture-acbb` |
| Slug | `foundry-visual-slice-pr2` |
| Prompt | A courier in a furnace foundry, orange claw enemy, 32px industrial kit, side-view metroidvania |
| Profile | `VISUAL_VERTICAL_SLICE` |
| Mode | `LOCAL_ONLY` |
| Seed | `20260909` |
| Godot | `4.7.1.stable.official.a13da4feb` |
| Viewport | 1920×1080 |
| Driver | `opengl3` (windowed) |
| Job | `job_mtv2uw16_0m753k` |
| `visualSliceApproved` | `false` (`VISUAL_SLICE_REJECTED`) |

## What changed (room 05 / `ability_shrine` only)

- **Camera:** contain-zoom the full room **width** × reachable platform band (`min(platform.y)−96` → room bottom), then pin to the floor so extra 16:9 pixels show the furnace hood, not a navy gutter under the plate. Collision/layout unchanged. Other archetypes keep prior contain-zoom.
- **HUD:** presentation mode (`METROFORGE_CAPTURE=1`) sizes `HUDFrame` to the health bar (~168×30) instead of the 276×136 backing.
- **Separation:** shrine FarSky is darkened and covers the authored room plate (not leftover contain-view sky). ParallaxNear hanging-chains hidden. Warm Ground vs cool/dark rear.
- **Focal point:** procedural RearWall furnace mouth, hood, and chimney stacks behind the floor pickup. No collision.
- **Placeholders:** player / pickup / NPC remain palette-tinted procedural blocks. Not courier art.

## Evidence

- Full-res still (byte-identical to `qa/screenshot_slice_ability_shrine.png`): [05_ability_shrine_fullres.png](05_ability_shrine_fullres.png)
- Gameplay (stays in room 05; walk right, collect floor pickup): [room05_ability_traversal_and_pickup.mp4](room05_ability_traversal_and_pickup.mp4)

Telemetry for the still: `zoom=2.40 view=800x450 center=400,555 strategy=windowed_gpu`.

## Checks (thresholds not weakened)

| Gate | Result |
|---|---|
| Playtest | **8/8 PASS** |
| Runtime smoke (windowed) | shrine still **visible** PASS; DEBUG HUD node asserts PASS; presentation skips scrap/echo **text** only |
| `gameplay_screenshot_qa` (spawn `qa/screenshot_gameplay.png`, not this shrine still) | **FAIL score 40** wallpaper/low-contrast (occupancy ~98%, lumaStdDev ~6.6) |
| Shrine still through the same critic | score **100** (occupancy ~0.48, lumaStdDev ~7.5) — informational; the gate still scores spawn |

Do not relax `gameplay_screenshot_qa` because the shrine still scores 100.
