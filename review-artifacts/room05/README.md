# Room 05 ability shrine — representative visual target

The Foundry slice is **rejected as a finished visual product**. MASS / LARGE / RC stay **blocked**. Do not merge.

Player and shrine NPC now use **original authored courier art** (`authored-original` / `QA_REVIEW`), not a recolor of the 4-color placeholder. Human **Approve Visual Direction** is still required. Enemies, tiles, VFX, HUD chrome, and boss remain PLACEHOLDER.

## Generation

| Field | Value |
|---|---|
| Code | `8c654db` (courier NPC + tutorial spawn framing) on `cursor/foundry-visual-recapture-acbb` |
| Slug | `foundry-visual-slice-pr2` |
| Profile | `VISUAL_VERTICAL_SLICE` |
| Mode | `LOCAL_ONLY` |
| Seed | `20260909` |
| Godot | `4.7.1.stable.official.a13da4feb` |
| Viewport | 1920×1080 |
| Driver | `opengl3` (windowed) |
| `visualSliceApproved` | `false` (`VISUAL_SLICE_REJECTED`) |

Preserved from the furnace pass: recessed cavity, coal bed, grate, rim, pickup cream outline (`outline_width` 1.0), compact HUD, collision, shrine telemetry `zoom=2.40 view=800×450 center=400,555`.

## NPC / courier

`npc_000.png` was a solid mustard cube; `modulate` cannot desaturate that. The generator now paints the same courier silhouette as the player (head, visor, arm, two legs, pack, 1px outline) with a soot-iron body and brass visor/pack accent. The shrine hue-stripping shader was removed. Provenance: [../assets/PROVENANCE.md](../assets/PROVENANCE.md).

## Evidence

- Prior shrine still (camera/HUD, empty firebox): [05_ability_shrine_fullres.png](05_ability_shrine_fullres.png)
- Prior lighting still (orange slab): [05_ability_shrine_lighting.png](05_ability_shrine_lighting.png)
- Furnace interior still (mustard cube NPC): [05_ability_shrine_furnace_interior.png](05_ability_shrine_furnace_interior.png)
- Courier NPC still (furnace preserved): [05_ability_shrine_courier_npc.png](05_ability_shrine_courier_npc.png)
- Cube vs courier: [05_ability_shrine_cube_vs_courier.png](05_ability_shrine_cube_vs_courier.png)
- Gameplay (prior clip; stays in room 05): [room05_ability_traversal_and_pickup.mp4](room05_ability_traversal_and_pickup.mp4)

## Checks (newly run this pass unless noted)

| Gate | Result |
|---|---|
| Playtest | **8/8 PASS** (newly run; persona `victory_rusher`, 38023ms, rooms 000–009, `gameComplete: true`) |
| Runtime smoke (windowed) | shrine still **visible** PASS; shrine telemetry `zoom=2.40 view=800x450 center=400,555` |
| `gameplay_screenshot_qa` spawn | **PASS score 100** (occupancy ~0.37, lumaStdDev ~13.0) — was FAIL 40 |
| Shrine still through the same critic | score **100** informational (occupancy ~0.36, lumaStdDev ~7.9) |

Thresholds were not changed. Spawn is framed on the tutorial playable band (`zoom=2.40 view=800x450 center=400,375`); that does not alter shrine telemetry.
