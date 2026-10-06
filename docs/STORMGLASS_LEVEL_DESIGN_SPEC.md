# Stormglass Reliquary level-design contract

This document turns the approved visual boards and the follow-up Copilot level-design study into implementation constraints for MetroForge's side-view generator. It is original design guidance based on genre conventions. It must not be used to copy another game's layouts or assets.

## Scale and movement envelope

- Grid: 32 px.
- Reference character envelope: 2 tiles wide and up to 3 tiles tall, while collision remains narrower than the art.
- Walk: 2.5 tiles/s. Run: 4 tiles/s.
- Base jump target: 6 tiles high, roughly 0.55 s total arc.
- Coyote time: 0.12 s. Jump buffer: 0.10 s.
- Ground and air dash target: 6 tiles over 0.18 s; air-dash recovery lockout 0.20 s.
- Wall-jump vertical gain: 4 tiles. Wall-slide descent: 1 tile/s.
- A fall of 12 tiles or less must always have a safe landing solution.
- Minimum ordinary headroom: 4 tiles. A full jump arc needs 6 tiles. Boss play space needs at least 10 tiles.

These are generation targets. Runtime tuning remains authoritative when measurements disagree; generator validators should use the measured movement envelope rather than art-frame dimensions.

## Camera contract

- Reference gameplay frame: 30 x 17 tiles.
- Dead zone: 6 x 4 tiles centered on the player.
- Look-ahead: up to 3 tiles in the movement direction.
- A doorway needs 2 tiles of flat, hazard-free transition space on both sides.
- Vertical shafts lock horizontal camera travel and scroll vertically.
- Boss arenas use a fixed wider frame equivalent to 34 x 17 tiles.

## Room archetypes

| Archetype | Target grid | Purpose |
| --- | ---: | --- |
| tutorial | 30 x 17 | Teach one verb with 0-2 enemies and no combined hazards. |
| combat | 36 x 20 | 4-6 enemies across floor and two or three readable tiers. |
| traversal shaft | 20 x 40 | 2-3 enemies; platforms every 6-8 tiles; camera rail. |
| ability shrine | 28 x 18 | Safe acquisition, demonstration lane, then proof gate. |
| gate | 30 x 17 | One readable lock and a two-tile safe approach. |
| save | 24 x 14 | Quiet room with no enemies or damaging hazards. |
| NPC | 26 x 15 | Safe conversation framing and clear exit sightlines. |
| secret | 18 x 10 | One ability proof and one meaningful reward. |
| miniboss | 40 x 22 | Guardian plus at most two adds, with sealed exits. |
| boss | 48 x 24 | One boss; 1-2 optional platforms; hazards restricted to edges. |

## Traversal geometry

- Ordinary horizontal gaps: 3-6 tiles.
- Ordinary vertical steps: 3-5 tiles.
- Combat tiers may sit at 4, 8 and 12 tiles above the floor when the movement kit supports them.
- Door openings are 3 tiles wide and 4 tiles high.
- Enemy spawn positions stay at least 2 tiles from doors and 3 tiles from damaging hazards.
- Flying enemy anchors are 6-10 tiles above the local floor.
- No required vertical drop may exceed 12 tiles without a safe landing or staged platforms.
- Spike runs require a one-tile visual warning strip.
- Falling hazards telegraph for at least 0.5 s. Magic traps show a one-tile glow before activation.
- Every third room is a save, NPC, landmark, or low-threat traversal beat.

## World structure

The world contains four ten-room biome chapters. Each chapter has a critical route, two optional reward opportunities, an ability teaching sequence, a quiet beat before its guardian, and a return shortcut that reconnects within two transitions.

Stormglass keeps its current six implemented abilities as the canonical runtime set:

1. Dash
2. Double jump
3. Wall slide / wall jump
4. Air dash
5. Ground slam (the heavy-strike gate verb)

Swimming is a biome traversal state where available. Proposed Ice Dash and Storm Glide remain future ability candidates and must not silently replace implemented abilities until their controllers, animations, gates and tests exist.

Ability-gate ordering invariant: a required ability must be obtainable before the first mandatory edge that requires it. A proof room follows acquisition before the ability is combined with combat or another hazard.

## Biome grammar

### Gothic Castle

- Traversal: wall-jump lanes, chandelier platforms, gear-timed jumps.
- Foreground: dark stone and iron. Midground: arches and pillars. Background: moonlit spires.
- Landmarks: gate, rose window, grand stair, clock shaft, bell.
- Hazards: spikes, crushers, falling chandeliers.

### Sunken Halls

- Traversal: shallow-water footing, swim/dive lanes, current tunnels, flooded platforms.
- Foreground: wet stone and algae. Midground: broken pillars. Background: submerged monastery mass.
- Landmarks: floodgate, drowned library, pressure shaft, water shrine.
- Hazards: currents, underwater spikes, falling masonry, pressure doors.

### Ancient Ruins

- Traversal: ground-slam/heavy-strike gates, glyph puzzles, collapsing platforms.
- Foreground: cracked stone and ancient wood. Midground: shelves and glyph slabs. Background: monumental statues.
- Landmarks: archive, collapse shaft, reliquary, sentinel dais.
- Hazards: debris, blades, pressure plates, unstable floors.

### Storm-Ice Heights

- Traversal: wind corridors, long air-dash lanes, clockwork platforms and brittle floors.
- Foreground: ice and steel. Midground: gears and chains. Background: storm clouds and peaks.
- Landmarks: frozen bridge, clock shaft, bell alcove, Tempest Abbot arena.
- Hazards: slippery footing, wind push, crushers, icicles and edge storms.

## Encounter and boss pacing

- Tutorial: 0-2 enemies.
- Combat: 4-6 enemies, never all activated from the entrance.
- Traversal: 2-3 enemies placed to pressure decisions without hiding landing zones.
- Miniboss: one guardian and at most two adds.
- Boss: one boss. Adds require an explicit phase rule.
- Boss approach: combat room, quiet/save room, readable boss door, then arena.
- Boss arena: 48 x 24 tiles, at least 10 tiles of clear vertical space, and 1-2 platforms at approximately 8 and 14 tiles when the boss kit benefits from them.

## Forty-room production blueprint

| # | Room | Biome | Archetype | Gate/reward | Landmark and play purpose |
| ---: | --- | --- | --- | --- | --- |
| 1 | Castle Gate | Gothic Castle | tutorial | none | Gate; movement onboarding. |
| 2 | Grand Hall | Gothic Castle | combat | none | Chandeliers; first layered encounter. |
| 3 | Moonlit Gallery | Gothic Castle | traversal | none | Stained glass; vertical-read lesson. |
| 4 | Dash Reliquary | Gothic Castle | ability shrine | Dash | Shrine, safe dash lane and proof gap. |
| 5 | Upper Hall | Gothic Castle | combat | Dash | Arches; dash combined with melee. |
| 6 | Clocktower Shaft | Gothic Castle | traversal shaft | wall movement | Gears and crushers. |
| 7 | Candle Alcove | Gothic Castle | save | none | Quiet checkpoint before guardian. |
| 8 | Secret Balcony | Gothic Castle | secret | wall jump / health upgrade | Breakable side wall and narrow ledge. |
| 9 | Bell Warden | Gothic Castle | miniboss | prior castle verbs | Great bell; guardian plus up to two adds. |
| 10 | Castle Floodgate | Gothic Castle | gate | Dash | Opens chapter transition and return loop. |
| 11 | Flooded Antechamber | Sunken Halls | tutorial | none | Shallow-water movement introduction. |
| 12 | Drowned Hall | Sunken Halls | combat | none | Broken pillars and split dry/wet lanes. |
| 13 | Current Tunnel | Sunken Halls | traversal shaft | none | Current direction and safe eddies. |
| 14 | Double-Jump Font | Sunken Halls | ability shrine | Double jump | Water altar and vertical proof. |
| 15 | Sunken Library | Sunken Halls | combat | Double jump | Shelves and flooded tier combat. |
| 16 | Pressure Shaft | Sunken Halls | traversal shaft | Double jump | Rising water and pressure doors. |
| 17 | Water Shrine | Sunken Halls | save | none | Quiet dry ledge checkpoint. |
| 18 | Under-Arch Cache | Sunken Halls | secret | swim / resource upgrade | Submerged crawlspace. |
| 19 | Drowned Guardian | Sunken Halls | miniboss | water chapter verbs | Raised platforms over a pool. |
| 20 | Floodgate Ascent | Sunken Halls | gate | Double jump | Drains route and opens return shortcut. |
| 21 | Collapsed Vestibule | Ancient Ruins | tutorial | none | Debris telegraph introduction. |
| 22 | Archive Gallery | Ancient Ruins | combat | none | Shelf tiers and construct encounter. |
| 23 | Collapse Shaft | Ancient Ruins | traversal shaft | wall movement | Staged debris and landing islands. |
| 24 | Slam Reliquary | Ancient Ruins | ability shrine | Ground slam | Relic pedestal and breakable floor proof. |
| 25 | Glyph Hall | Ancient Ruins | combat | Ground slam | Glyph traps and armored constructs. |
| 26 | Puzzle Chamber | Ancient Ruins | gate | Ground slam | Pressure plates and readable rune door. |
| 27 | Reliquary Rest | Ancient Ruins | save | none | Quiet relic checkpoint. |
| 28 | Glyph Wall Secret | Ancient Ruins | secret | Ground slam / relic | Breakable rune wall and compact reward test. |
| 29 | Sentinel Dais | Ancient Ruins | miniboss | ruin chapter verbs | Circular guardian platform. |
| 30 | Ruins Lift | Ancient Ruins | gate | Ground slam | Opens vertical link and return floor. |
| 31 | Frozen Approach | Storm-Ice Heights | tutorial | none | Ice footing and wind telegraph. |
| 32 | Storm Bridge | Storm-Ice Heights | combat | none | Narrow bridge with protected recovery pockets. |
| 33 | Frozen Clock Shaft | Storm-Ice Heights | traversal shaft | wall movement | Gear platforms and icicles. |
| 34 | Air-Dash Belfry | Storm-Ice Heights | ability shrine | Air dash | Long safe proof lane. |
| 35 | Wind Corridor | Storm-Ice Heights | combat | Air dash | Wind, aerial enemies and sheltered platforms. |
| 36 | Broken Bell Rise | Storm-Ice Heights | traversal | Air dash | Combined wall jump and air dash ascent. |
| 37 | Bell Alcove | Storm-Ice Heights | save | none | Warm checkpoint and final approach. |
| 38 | Frost Cavern Secret | Storm-Ice Heights | secret | Air dash / health upgrade | Brittle wall and precision route. |
| 39 | Tempest Abbot Arena | Storm-Ice Heights | boss | full required kit | Wide frozen clockwork platform and edge hazards. |
| 40 | Restored Reliquary | Storm-Ice Heights | finale/gate | boss defeated | Weather seal restoration and completion exit. |

## Generator validation invariants

1. The critical path is traversable with abilities acquired in the declared order.
2. Every mandatory gate appears after its acquisition room and after a safe proof challenge.
3. Every door has a reachable sensor, four-tile clearance and a two-tile hazard-free approach.
4. Every room transition has a reciprocal or intentionally one-way graph declaration.
5. Optional loops reconnect to the critical path within two transitions.
6. Enemies remain at least two tiles from doors and three tiles from damaging hazards.
7. Camera bounds contain all required traversal and do not expose outside-room voids.
8. Boss and miniboss arenas meet their size, clearance, exit-lock and spawn rules.
9. Secrets are reachable with the declared ability and provide a meaningful reward.
10. No required drop exceeds the measured safe-fall envelope without staged landings.
11. A low-threat or rest beat occurs at least once in every three consecutive critical-path rooms.
12. Automated traversal, visible captures and room-schema checks must cover all four biomes.

## Authored visual-production rules

These rules turn a structurally valid room into a room that reads as intentionally authored and matches the scale and finish of the character art.

### Character-to-environment scale

- Keep the player at 3 x 2 tiles (96 x 64 px) and all collision-critical geometry on the 32 px grid.
- A walkable platform is at least one full tile thick. Major arches and pillars are at least twice the character height; landmark silhouettes span 20-40 tiles vertically when the room permits it.
- Gameplay silhouettes and primary props must remain readable at two tiles or larger. Decorative clusters may be no larger than 3 x 3 tiles before a negative-space break.
- Target 30-40% foreground detail coverage, 20-30% midground coverage and 40-60% background coverage. Keep at least 40% of the gameplay frame visually quiet.
- Use no more than five non-gameplay decorative focal elements in one camera frame. The player, hazards, exits and interactables must retain the strongest contrast.

### Archetype silhouettes and traversal beats

Every room must remain identifiable as its archetype when reduced to a black-and-white collision silhouette.

| Archetype | Required silhouette | Required beat |
| --- | --- | --- |
| Tutorial | Long baseline with one or two gentle elevation changes | Teach one verb without lethal pressure. |
| Combat | W- or M-shaped three-tier arena | Pressure, recovery pocket, renewed pressure. |
| Traversal shaft | Tall narrow lane with alternating ledges | Climb rhythm, rest shelf, harder climb rhythm. |
| Ability shrine | Symmetrical chamber and centered altar | Quiet approach, ability reveal, safe proof challenge. |
| Gate | Narrow approach, visible obstruction, wide reveal beyond | Read requirement, use ability, receive spatial payoff. |
| Save | Low U-shaped alcove with flat floor | Immediate safety and visual decompression. |
| NPC | Stage-like floor with a distinct backdrop | Approach, readable character focus, clean exit. |
| Secret | Asymmetrical L- or S-shaped pocket | Notice telegraph, enter, claim reward, rejoin route. |
| Miniboss | Wide floor with one or two tactical perches | Introduction, focused fight, shortcut or gate payoff. |
| Boss | Cathedral-scale rectangle with two or three movement lanes | Approach, lock-in, multi-phase fight, finale. |

Give each room one primary traversal verb and at most one supporting verb. Increase traversal complexity once per three-room act, not in every room.

### Ten-room biome pacing

- Act I, local rooms 1-3: establish palette, traversal grammar and primary landmark; use 2-3 enemies and no hazard that needs the unearned biome ability.
- Act II, local rooms 4-7: grant or prove the ability, introduce a readable gate, raise combat to 4-6 enemies, include one optional loop and end on a save or low-threat beat.
- Act III, local rooms 8-10: combine mastered verbs, present the strongest landmark, resolve the guardian or boss and open a return shortcut. Combat may reach 6-8 only when staged in distinct activation groups.
- Show a clear environmental progression: castle instability, deeper flooding, increasing archive corruption and worsening storm intensity.

### Landmarks and continuity

- Place the primary landmark in local rooms 1, 5 and 9. Show secondary views or fragments in rooms 3 and 7 so the player can orient without the map.
- A landmark must be visible in the entry camera frame, occupy roughly 20-40% of background height and never hide a landing surface, enemy telegraph or doorway.
- Adjacent rooms share two or three transition props, light direction and at least one background layer. Keep room-to-room hue change within 10% and brightness change within 15%, except for a deliberate biome boundary reveal.
- Within two tiles of an exit, introduce a small material or color cue from the destination room.

### Encounter staging

- Pair melee enemies with broad flat lanes, ranged enemies with mid-height perches, flying enemies with open vertical lanes and heavy enemies with at least six tiles of horizontal clearance.
- A combat room contains one primary enemy family, one supporting family, at most one active terrain hazard and at least one 4 x 4-tile recovery pocket.
- Narrow bridges support ranged pressure, shafts support aerial pressure, flooded lanes support slow pursuit and ice lanes support momentum or wind pressure.
- Preserve staged activation. The entry frame must reveal the first threat and a safe decision space, not the entire encounter at once.

### Secret language

- Gothic Castle: cracked masonry and displaced mortar.
- Sunken Halls: loose underwater brickwork and an abnormal drip or current.
- Ancient Ruins: split glyphs with restrained arcane light.
- Storm-Ice Heights: frosted brittle walls and hairline blue fractures.
- A normal optional secret uses two cues. A progression-critical hidden route uses three cues including audio. Never rely on a color shift alone for required content.

### Parallax and occlusion

- Foreground motion: 1.2x camera movement; midground: 0.6x; background: 0.3x; distant sky/weather: 0.1x.
- Use one or two foreground layers, two midground layers, three background layers and an optional sky/weather layer.
- Foreground art may cover no more than 15% of playable space in a captured frame; midground occlusion may cover no more than 5%. Background art must not conceal gameplay geometry.

### Minimum modular art kit per biome

| Biome | Platforms | Walls | Props | Hazards | Landmarks | Doors | Ladder/vertical supports | Background layers |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Gothic Castle | 6 | 4 | 12 | 3 | 3 | 3 | 2 | 3 |
| Sunken Halls | 5 | 4 | 10 | 3 | 3 | 2 | 2 | 3 |
| Ancient Ruins | 6 | 5 | 12 | 4 | 3 | 3 | 2 | 3 |
| Storm-Ice Heights | 6 | 5 | 14 | 4 | 3 | 3 | 2 | 4 |

Each normal room uses at least three platform variants and two wall variants, while avoiding obvious repeated tile strings longer than four tiles. Each of the 40 rooms also needs one authored composition, prop cluster or landmark arrangement that is not emitted by the generic archetype template.

## Visual acceptance captures

Capture every room at entry, midpoint and exit at the standard gameplay viewport.

- Entry: the room silhouette and intended landmark are readable, the player separates from the background, and the first safe route is visible.
- Midpoint: the primary traversal verb, enemy-terrain relationship, hazard telegraph and recovery pocket are visible.
- Exit: the doorway silhouette is clear, the next room is hinted and background continuity is preserved.
- Reject a capture when foreground occlusion exceeds 15%, repeated tiles form an obvious pattern, decoration competes with hazards or the player, the biome cannot be identified without the room name, or the frame lacks a unique authored element.
- Automated checks cover dimensions, density ranges, variant counts, encounter clearances and graph reachability. Screenshot review remains a required visual-quality gate rather than being inferred from runtime success.
