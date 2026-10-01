# Stormglass Reliquary — side-view rebuild

Status: new independent side-view Metroidvania set. The existing Spore Galleries build remains a regression reference and backup; none of its art is accepted into this set by default.

## Game identity

- **Title:** Stormglass Reliquary
- **Player fantasy:** a swift Veilblade restoring weather seals inside a drowned cliff monastery
- **Visual language:** authored HD pixel art, deep indigo masonry, teal rain light, amber cloth, fractured rose-and-cyan stained glass
- **Silhouette rule:** the player always reads through a short cloak, bright scarf tail, low crescent blade, and pale mask
- **Forbidden carryover:** fungal caves, foundry machinery, courier suit, reused Spore Scout actors, and industrial checkerboard terrain

## Vertical slice structure

1. **Rainward Cloister** — movement tutorial, readable two-height nave, first weather seal.
2. **Prism Aqueduct** — waterwheel traversal, dash routes, glass bridges, ranged enemies.
3. **Starless Belfry** — vertical ascent, wall movement, storm exposure, guardian boss.

Rooms use deliberate silhouettes: one dominant route, one optional reward route, a clear entrance-to-exit sightline, and landmarks occupying at least one quarter of the camera. Platforms use 32 px modules but avoid single-tile noise.

## Player animation contract

All strips are transparent 64×64 bottom-anchored frames. Feet remain at y=56 on grounded clips. Horizontal facing uses runtime mirroring from one authored right-facing family.

| Clip | Frames | Purpose |
|---|---:|---|
| idle | 8 | breathing, scarf motion, blade settling |
| walk | 10 | readable opposing arm/leg motion |
| run | 12 | forward lean, longer stride, trailing scarf |
| jump_start | 4 | compression and takeoff |
| jump | 4 | rising silhouette |
| fall | 4 | controlled descent |
| land | 5 | impact and recovery |
| dash | 8 | anticipation, streak, recovery |
| attack | 10 | anticipation, contact, follow-through |
| hurt | 5 | directional recoil |
| death | 10 | readable collapse without changing anchor |

## Acceptance gates

- Separate asset manifest and output directory from the top-down set.
- No asset hash copied from the rejected Spore Galleries character or terrain family.
- Every locomotion strip has multiple distinct silhouettes and a stable bottom anchor.
- Native Godot smoke and playthrough remain mandatory.
- Windowed gameplay capture must show the new player, new terrain, and at least one landmark before visual approval.
