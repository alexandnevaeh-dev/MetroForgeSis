# Stormglass Reliquary Level Design Implementation Brief

Source: follow-up design review requested from the user's Copilot Stormglass reference conversation on 2026-09-30. This brief records the useful implementation direction. Movement measurements are targets until verified against the playable controller.

## Authoritative visual and gameplay grammar

All rooms use a 32 px design grid and a 96 px-tall player reference. The intended camera view is 30 x 17 tiles, with a 6 x 4 tile dead zone and 3 tile forward look. Walkable platforms are at least one tile thick and ceilings over traversable space provide at least four tiles of clearance.

- Gothic Castle: tall arches, staggered galleries, long 6-10 tile stone platforms, short gear or chandelier platforms, and a vertical-horizontal-vertical rhythm. Warm candle pools contrast with cold moonlight and stained glass.
- Sunken Halls: broad basins, broken 4-6 tile pillars, 3-5 tile floating debris, vertical water shafts, and a swim-climb-dive-surface rhythm. Teal caustics and lanterns separate playable surfaces from flooded depth.
- Ancient Ruins: broken rectangles, diagonal collapses, 4-8 tile marble blocks, 3-6 tile shelves, and a puzzle-combat-collapse-shrine rhythm. Torch warmth contrasts with purple glyph light.
- Storm-Ice Heights: tall spires, exposed 6-10 tile bridges, 4-6 tile ice slabs, clockwork platforms, and a dash-glide-climb-dash rhythm. Cold cyan light, storm flashes, bells, gears, and lightning rods carry the biome identity.

## Controller targets to validate

- Run speed: 4 tiles per second.
- Jump height: 6 tiles with a 0.55 second arc.
- Dash distance: 6 tiles; proposed air-dash lockout 0.20 seconds.
- Wall-jump vertical gain: 4 tiles.
- Safe fall: no more than 12 tiles.
- Standard horizontal gaps: 3-8 tiles; standard vertical steps or drops: 4-12 tiles.
- Combat tiers use floor, 4 tile, 8 tile, and at most 12 tile elevations.

Automated controller-envelope tests must establish the true minimum and maximum values before authored rooms use these dimensions.

## Ten-room biome cadence

Each biome follows the same readable dramatic spine while changing its geometry and mechanics:

1. Tutorial room establishes material, landmark, and traversal grammar.
2. Combat room tests the base movement in terrain.
3. Traversal room escalates elevation or biome movement.
4. Ability shrine grants or formalizes the biome verb.
5. Combat room combines the new verb with mixed enemies.
6. Traversal or gate room tests mastery.
7. Save alcove provides recovery and visual quiet.
8. Optional secret loop rewards observation and the learned verb.
9. Miniboss or final boss resolves the biome's combat grammar.
10. Exit gate previews the next biome's palette and material language.

Checkpoints are rooms 7, 17, 27, and 37. Normal death runs should cross no more than three rooms. A boss run should cross one safe transition; the current room numbering needs a direct Room 37-to-39 shortcut so Room 38 remains optional.

## Encounter budgets

- Tutorial: 0-1 enemies, no mandatory hazard.
- Combat: 4-6 enemies across at most two complementary enemy types, one terrain hazard, and one safe recovery pocket.
- Traversal: 2-3 enemies and 1-2 hazards that reinforce the movement verb.
- Secret: at most one weak guard; the challenge is discovery or traversal.
- Miniboss: one miniboss and no more than two supporting enemies; one arena hazard.
- Boss: boss only, with at most two clearly telegraphed arena hazards.

Melee enemies require stable floors, ranged enemies use mid-height platforms, flying enemies require open vertical lanes, and heavy enemies require broad clear floors. No hazard begins within three tiles of an entrance or spawn point.

## Readability and authorship rules

- The entry camera frame identifies the room silhouette, primary landmark, immediate safe ground, and first intended direction.
- Foreground art may cover no more than 15 percent of playable space and may never hide entrances, hazards, enemies, or landing edges.
- Background contrast stays below the character and collision-edge contrast. Gameplay silhouettes remain readable in grayscale.
- Avoid obvious runs of more than three identical tiles; use authored damage, trim, props, and silhouette changes rather than random scatter.
- Each room contains one unique authored element tied to its function or story.
- Save and shrine rooms use symmetry and visual quiet; secret rooms use asymmetry and a biome-specific repeated telegraph.
- Adjacent rooms share material, light direction, and two or three transition motifs. Exit framing previews the next room without replacing the current biome identity.

## Required modular kit minimums

| Biome | Platforms | Walls | Props | Hazards | Landmarks |
| --- | ---: | ---: | ---: | ---: | ---: |
| Gothic Castle | 6 | 4 | 12 | 3 | 3 |
| Sunken Halls | 5 | 4 | 10 | 3 | 3 |
| Ancient Ruins | 6 | 5 | 12 | 4 | 3 |
| Storm-Ice Heights | 6 | 5 | 14 | 4 | 3 |

These are visual variants, not simple recolors. Each kit also needs biome-specific door/gate states, a checkpoint focal prop, transition pieces, collision-safe edges, and three depth layers.

## Vertical slice rebuild order

Rebuild Rooms 1-5 first:

1. Castle Gate: establishes scale, entrance composition, safe movement, and the castle palette.
2. Grand Hall: proves combat tiers, enemy-terrain relationships, and the chandelier landmark.
3. Moonlit Gallery: proves vertical camera behavior, wall-jump spacing, and stained-glass depth.
4. Wall-Jump Shrine: proves quiet-room composition, focal lighting, reward presentation, and ability acquisition.
5. Upper Hall: proves that the granted movement verb combines cleanly with combat and authored platform composition.

Together these rooms exercise onboarding, combat, vertical traversal, ability acquisition, return gating, landmark continuity, environment kits, and screenshot acceptance without requiring all four biomes first.

## Acceptance tests

- Controller-envelope test measures actual jump, dash, wall-jump, ledge, and safe-fall limits on the 32 px grid.
- Every room is traversable with only the abilities available when it is first reached, and no room can softlock the player.
- Enemy counts and hazards remain within the archetype budgets.
- Required backtracking shortcuts reconnect within two transitions after the relevant ability is earned.
- Capture entry, traversal/combat, and exit frames for every room.
- Entry captures show the landmark, safe ground, intended direction, and readable player silhouette.
- Mid-room captures show the primary movement verb and enemy-terrain relationship.
- Exit captures preserve palette continuity and clearly silhouette the door or transition.
- Screenshot review rejects foreground occlusion over 15 percent, unreadable collision edges, repeated three-plus tile patterns, missing biome landmarks, and rooms without a unique authored element.
