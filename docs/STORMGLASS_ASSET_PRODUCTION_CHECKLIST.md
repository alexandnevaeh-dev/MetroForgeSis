# Stormglass asset production checklist

Updated 2026-10-05. Scope: original side-view Stormglass only. The stylized top-down set has a separate art direction and must not share replacement character sheets or room materials by accident.

Reference: user-supplied stage maps and [shared production discussion](https://copilot.microsoft.com/shares/W3c3Fw9C77zWfQh73eZgq). These inform architectural rhythm and production coverage; franchise pixels, characters, names, music and maps are not game assets.

## Acceptance rules

Track each item independently through **planned → asset present → integrated → technically tested → visually accepted**. A generated picture, nonempty frame, successful import or screenshot does not establish visual acceptance. Optional mechanics require an explicit design choice before expanding the runtime.

Each shipped asset needs an original/source and license record, stable identifier, side-view set tag, dimensions, pivot, frame count, timing, import settings and dependencies. Animations also need contact/recovery poses and gameplay event timing. Keep rejected studies recoverable on E:.

## Current evidence and gaps

| Work | Evidence | Acceptance boundary |
| --- | --- | --- |
| Eight architectural families | `packages/godot/src/castle-room-family.ts`; gallery, chapel, library, arena, crypt, laboratory, mine, entrance | Candidate multi-storey scaffolds; distinct branching topology and complete input traversal remain open |
| Original furnishing study | E:/MetroForgeData/ArtProduction/stormglass-modular-kit-20261004-v1/architecture-atlas.png; 12 atlas regions | Rendered in isolated candidate; not production-approved |
| Native room renders | E:/MetroForgeData/Development/castle-room-families-20261004-v2/games/stormglass-castle/qa/castle-room-families/proof.json | 32 structural/render checks and 16 captures; controlled camera/player placement, not input traversal |
| Existing large castle route | E:/MetroForgeData/Development/region-preview-20261004-v2/games/stormglass-castle/qa/castle-region | 59 real-input observations; covers prior large region, not all new family layouts |
| Room editor preview | E:/MetroForgeData/Development/region-preview-20261004-v4/ui-proof.json | 13 actual-app checks; masonry approximation, native preview remains authoritative |
| Shared furnishing plan and editor parity | E:/MetroForgeData/Development/castle-furnishing-editor-20261005-v1/summary.json; furnishing-parity.json | 21 actual-app checks, 20 furnishing positions agree with native within 0.001 world pixels; missing-image recovery and Undo tested; visual acceptance remains open |
| Combat feedback lifecycle | E:/MetroForgeData/Development/stormglass-feedback-20261005-v1/candidate-lifecycle.log | 10 checks; overlapping flashes/shakes restore original values, owned timers clean up, external pause preserved |
| Player hurt recovery lifecycle | E:/MetroForgeData/Development/stormglass-player-recovery-20261005-v1/candidate-final.log | 8 checks; removing a hurt player no longer leaves its recovery timer; protected and invalid hits do not restart recoil/recovery |
| Visible full campaign after runtime fixes | E:/MetroForgeData/Development/stormglass-player-recovery-20261005-v1/campaign/native-summary.json | 40 input-driven steps, four bosses, six abilities, cleared-arena return visits; native exit 0, no script/native errors; ObjectDB shutdown warning still open |
| Combat microfixture geometry | E:/MetroForgeData/Development/stormglass-combat-fixture-20261005-v1/combat-micro.log | Approach range derived from current melee sockets and hitboxes; actual attacks, enemy death and contact invulnerability pass; no gameplay hitbox enlargement |
| Character movement | Existing strips plus two isolated replacement studies | Human movement remains unresolved; replacement studies not admitted |
| Eight-family input smoke and stairs | E:/MetroForgeData/Development/castle-room-families-20261004-v2/games/stormglass-castle/qa/castle-room-family-input/proof.json | 104 passing gameplay assertions: grounded spawn, jump, walk, attack playback, landing and eight first-staircase treads per room; full upper routes/door returns remain open |
| Animation content audit | `scripts/audit-stormglass-animation-content.mjs`; E:/MetroForgeData/Development/stormglass-animation-content-20261004-v2/audit.json | 27 clips present; three combo sheets identical, distinct-core gate fails intentionally; no human-motion acceptance |
| Focused source checks | Castle family, region and authored-animation tests | 24 passing tests; animation file checks do not prove natural movement |
| Engine parity | Godot native renders; Unity/Unreal static fixture validation | Fresh native Unity/Unreal parity remains open; Unity capture rejected stale source-bound build |
| Local NVIDIA | Fresh CUDA matrix passed; material study timed out | No successful fresh local image-generation result |
| GitHub publication | Existing configured remote | Authentication token invalid; no upload claimed |

## Production coverage

Unchecked entries are outstanding acceptance work, including entries with existing runtime placeholders. Do not interpret these as proof that an entire system is absent.

### Player and combat

- [ ] Idle variants, walk and run: consistent adult proportions, stable head/hips, alternating leg contacts, opposite arm swing, controlled cloth lag, clean loop seam.
- [ ] Jump start, apex, fall and landing: distinct silhouettes and grounded recovery.
- [ ] Wall slide/jump and ledge climb: hands and feet meet the wall/ledge; no floating grips.
- [ ] Light chain, heavy/charged attack, air attack, dash attack, ranged cast: distinct anticipation/contact/recovery; weapon pivots and hit events agree.
- [ ] Parry/block/counter, hurt/stagger, death: supported actions receive dedicated poses rather than renamed duplicate strips.
- [ ] Double jump, dash, slide, grapple throw/swing, ground pound and pickup: complete ability-to-animation mapping.
- [ ] Dust, slash, impact, dash trail, activation and healing/buff effects.
- [ ] Optional crouch/crawl, ladder, swimming and alternate forms: scope first, then produce complete movement/combat sets.
- [ ] Dark-room silhouette/readability and mirrored-facing review at actual gameplay scale.

### Enemies and bosses

- [ ] Every enemy: idle, patrol/move, attacks, hurt, death, special ability, applicable projectile/VFX and sound; biome identity and hitbox/event alignment.
- [ ] Roster coverage: fodder, mid-tier, elite, flying, ranged, armored and environmental enemies.
- [ ] Every boss: phase-specific idle/movement/attacks, telegraphs, transition, projectiles, summons where used, arena hazards, introduction and defeat.
- [ ] Boss effects: readable warning before damage, large impacts and arena changes; optional third phase scoped separately.

### World materials and furnishings

- [ ] Every biome: ground/wall/ceiling variants, solid/breakable/moving platforms, decorative and hazard tiles, parallax layers, lights and material-specific footsteps.
- [ ] Optional slopes and water: collision/physics contract before art admission; animated surface when water is supported.
- [ ] Props: statues, bones, machinery, foliage, crystals, furniture/books, rubble, pipes/vents and animated lanterns/torches.
- [ ] Entrance: marble variation, banners, monumental arches, statues and chandeliers; long arrival hall plus connected return route.
- [ ] Gallery: framed recesses, balcony trim and varied chamber proportions; branching corridors and stair junctions.
- [ ] Chapel: stained glass, bells, buttresses and distant skyline; tower climbs with safe landings and bridge connections.
- [ ] Library: shelves, desks, books and reading lights; stacked balconies and a concealed study.
- [ ] Arena: weapon racks, spectator arches and braziers; clear combat floor and boss-specific arena dressing.
- [ ] Crypt: sarcophagi, grave markers, bone clusters and cracked masonry; low corridors, burial chambers and secret routes.
- [ ] Laboratory: apparatus, tanks, pipes and gauges; switch puzzles and vertical machine shafts.
- [ ] Mine: support beams, rock edges, chains, ore and lamps; irregular caverns linked to controlled vertical descents.
- [ ] Future clockwork, royal quarters, waterway, garden and corrupted regions: proposed extensions, not implemented biome claims.

### Interactables, hazards and room roles

- [ ] Locked/sealed/ability doors, switches, lifts, moving platforms, breakable walls/floors, pushable blocks, teleporters, save points, shops and NPCs.
- [ ] Supported hazards: spikes, saws, fire jets, poison, falling platforms, lasers and crushing traps; activation/recovery visuals and sounds match damage windows.
- [ ] Combat, traversal, puzzle, save, shop, boss, hidden, fast-travel, ability-pickup and transition rooms have explicit roles and map metadata.
- [ ] Every entrance/exit is reachable with its registered prerequisite; return traversal and save/reload are tested without granting unearned abilities.

### Progression and UI

- [ ] Every ability: pickup sprite/animation, icon, UI card and activation effect.
- [ ] Gates: door colors/runes, high ledges, heavy blocks, underwater/corruption obstacles and ability-specific barriers; explain restrictions without color alone.
- [ ] HUD: health, resource, currency, cooldown and status icons; readable against every biome.
- [ ] Pause, inventory, equipment, map and settings; optional quest log and bestiary scoped separately.
- [ ] Map: rooms, player, save/shop/boss/ability/locked door/fast travel and discovered-secret markers; undiscovered secrets remain concealed.
- [ ] Hover/focus, transitions and unlock popups; keyboard/controller navigation and compact-window readability.

### Audio and effects

- [ ] Surface footsteps, jump/land, swings/impacts, enemy sounds, boss warnings, UI feedback, abilities and biome ambience.
- [ ] Title, biome, boss, save/shop themes, pickup and secret stings; loop seams, loudness, mixer routing and licensing reviewed.
- [ ] Dust, mist, debris/leaves, glows, magic, impacts, camera shake and supported weather; effects preserve telegraph visibility and respect reduced-effects settings.
- [ ] Resolve native shutdown resource warnings before release acceptance.

### Technical and delivery

- [ ] Collision masks/layers, tilemaps, parallax, animation controllers/state machines, scene/prefab contracts and room connection metadata.
- [ ] Save/dialogue/inventory/ability data and enemy/boss AI contracts: schema validation plus persistence and progression tests.
- [ ] Organize within existing scenes/scripts/assets/animations/tilesets/ui/vfx/audio/levels/autoload/data conventions; avoid moving user work merely to match a generic list.
- [ ] Validate Godot, Unity and Unreal against the same admitted assets and source revision; retain native execution evidence separately from static validation.
- [ ] Validate local NVIDIA generation with an actual resulting image and provenance, beyond CUDA availability.
- [ ] Recoverable E: backup, source/art hashes, dependency/cache locations and an isolated publication snapshot; remote commit verification after authenticated upload.

## Next acceptance sequence

1. Repair the human locomotion foundation and inspect loops at gameplay scale before replacing character art.
2. Turn the eight architectural studies into differentiated connected room layouts; run input-driven entry, traversal and return tests.
3. Admit furnishings with consistent palette, scale, pivots and material texture; remove placeholder collisions and visual overlaps.
4. Complete enemy/boss, progression, UI and audio coverage against this checklist; retain individual evidence rather than a single completion percentage.
5. Rebuild and execute native engine exports, finish local generation validation, then publish the reviewed snapshot when GitHub authentication works.
