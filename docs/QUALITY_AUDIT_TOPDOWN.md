# Quality Audit: Top-Down / Three-Quarter

Date: 2026-09-26  
Root: `E:\Metroforge\MetroForge-Publish` (`E:\Projects\MetroForge\Forged` still missing)  
Prerequisite: side-view quality pass (`docs/QUALITY_AUDIT_ANIMATION_ENVIRONMENT.md`) — preserved.

## 1. Current top-down architecture

| Layer | Location | Notes |
|---|---|---|
| Runtime controller | `templates/godot-topdown-adventure/scripts/player/TopDownPlayerController.gd` | Dedicated 8-dir controller (not side-view minus gravity) |
| Movement config | `PlayerMovementConfig.gd` + `movement.json` | Shared loader; previously mixed jump/gravity fields |
| World gen | `packages/procedural/src/topdown/world.ts` | Continuous overworld + linear 4-room dungeons |
| Directional anim | `AnimatedAssetSprite.gd` + `docs/TOPDOWN_DIRECTIONAL_ANIMATION.md` | Optional N/NE/… strips; generation often missing |
| Combat | Startup/Active/Recovery state machine | Fixed 0.08/0.10/0.18s — not clip AttackTiming |
| Camera | `TopDownCamera.gd` | Follow camera |
| Y-sort | Template scenes | Partial; prop footprints authored via `TopDownPropLayout` |

## 2. Systems reused from side-view

- `AttackTiming` / animation sidecar schema  
- `EnvironmentArchetype` + `RoomPurpose`  
- BiomeVisualDNA / ArtBible / AssetFoundry  
- Genre capability registry (`supportsFreePlanarMovement`, …)  
- Hitbox/Hurtbox/VFXManager components  

## 3. Incorrect side-view assumptions found

- `PlayerMovementConfig` carried jump/gravity defaults into top-down  
- Dash = hold-to-sprint only (no dodge/roll grammar)  
- Facing always = movement (no move/aim split)  
- Attack VFX not spawned on active frames  
- Dungeon rooms were identical empty rectangles  

## 4. Missing top-down systems (still open after this pass)

- Full 8-dir sheet generation in AssetFoundry  
- Twin-stick independent aim input  
- Boss telegraphs (cone/circle/line)  
- Building floor adjacency graph  
- Prop collision footprints validated vs visual canopy  
- Unity/Unreal top-down parity  

## 5–12. Limitations summary

Directional animation optional → run often falls back to walk flip.  
VFX still actor-offset, not weapon sockets.  
Navigation is tile walkability + de-pinch (good), not full navmesh roles.  
Dungeon was chain of boxes → now semantic carved layouts.  
Biome continuity on overworld still single theme string.  
Depth sorting exists for authored props; generated props incomplete.

## Recommended sequence (status)

1. TopDownMovementProfile — **done** (`packages/shared/src/topdown-movement.ts`)  
2. Facing / move split — **done** (controller)  
3. Directional anim generation — pending Foundry  
4. Combat timing from sidecar — **done**  
5. VFX on active frame — **partial** (hit_spark at tip offset)  
6. Collision/nav clearance — existing + POI clear in new carves  
7. Depth/occlusion — pending  
8. Environment archetypes TOP_DOWN overrides — **done**  
9. Semantic dungeon carves — **done** (hall/library/chapel/crypt)  
10–18. Large areas, AI roles, boss telegraphs, editor — pending  

## Implementation notes (this pass)

- `buildTopDownMovementJson` writes `topDown` profile into `movement.json`  
- Controller: dodge on dash tap, sprint on hold, run clip when fast, AttackTiming-driven windows  
- Dungeon rooms named + carved by archetype; world-graph stamps `environmentArchetype` / `roomPurpose`  
- `scoreTopDownRoom` heuristic for QA/regen loops  
