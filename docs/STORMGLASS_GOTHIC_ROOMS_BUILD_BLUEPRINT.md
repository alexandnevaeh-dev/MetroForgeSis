# Stormglass Reliquary: Gothic Rooms 1-5 Build Blueprint

Source: follow-up consultation in the user's Microsoft Copilot Stormglass reference chat on 2026-09-30. This document records the completed implementation blueprint for the first five Gothic rooms. It supplements `STORMGLASS_LEVEL_DESIGN_SPEC.md` and `STORMGLASS_LEVEL_DESIGN_IMPLEMENTATION_BRIEF.md`.

## Authoritative shared metrics

- Tile grid: 32 px.
- Character: 96 px tall (3 tiles), 64 px wide (2 tiles).
- Gameplay camera: 30 x 17 tiles.
- Collision surface: 1 tile thick, dressed with 2-3 tiles of visible architectural mass below it.
- Minimum overhead clearance: 4 tiles above the player.
- Castle gaps: 3-6 tiles horizontal and 4-8 tiles vertical.
- Foreground occlusion: at most 15%.
- Background decorative coverage: at most 15% in the gameplay silhouette.
- Landmark rooms in the opening sequence: Rooms 1, 3, and 5.
- Non-boss rooms: at most one active environmental hazard.
- Room silhouettes must be authored per room rather than selected randomly.

## Gothic visual grammar

- Platforms use dark stone, iron braces, and a one-tile bevel or ornamental edge. Every elevated platform must show a physical support such as a bracket, chain, pillar, or gear.
- Structural walls read as 3-5 tiles thick. Repeat arches every 6-10 tiles, pillars every 8 tiles, and banners approximately every 12 tiles without creating obvious copy-paste runs.
- Traversable doors have a 3 x 4 tile opening within a 5-6 tile tall Gothic arch. Use iron gates or wooden double doors.
- Shrines use a 3 x 2 tile altar, 1-2 tile candle clusters, and a stained-glass backlight.
- Parallax uses midground arches at 0.6 camera speed, castle interior at 0.3, and moonlit exterior at 0.1. Background shapes cannot overlap the readable player, platform, hazard, or enemy silhouettes.
- Props appear in groups of 2-4 within roughly 3 x 3 tile zones. Props cannot obscure the character or traversal edges.
- Spike hazards reserve one tile for advance telegraphing. Falling chandeliers reserve a two-tile warning/shake zone. Gear crushers glow for one tile of travel before activation.

## Room 1: Castle Gate

- Purpose: safe tutorial; 30 x 17 tiles; about 30 seconds; elevation 0 to 0.
- Entry: (0,12). Exit: (29,12).
- Main floor collision: (0,12)-(29,13).
- One-way tutorial platform: (10,10)-(14,10).
- Full-height boundary walls at x=0 and x=29.
- Camera: one fixed 30 x 17 composition with no vertical shift.
- Landmark: gate arch bounds (22,4)-(29,12), visible on entry.
- Props: candles at (4,12) and (8,12); banner cluster bounds (15,4)-(17,8).
- No enemies, pits, hazards, secrets, or return gates.
- Sequence: enter, read the gate landmark, run, jump onto the low one-way platform, drop through, and exit through the gate.

## Room 2: Grand Hall

- Purpose: first combat room; 36 x 20 tiles; about 60 seconds; elevation 0 to +2.
- Entry: (0,14). Exit: (35,12).
- Main floor collision: (0,14)-(35,15).
- Platforms: A (8,10)-(14,10), B (20,8)-(26,8), high platform (28,6)-(32,6).
- Full-height boundary walls at x=0 and x=35.
- Camera: horizontal follow with no more than two tiles of vertical adjustment.
- Landmark: chandelier cluster bounds (12,2)-(24,4).
- Props: broken pillar bounds (6,14)-(7,15); gear assembly bounds (18,14)-(20,16).
- Encounter: four melee knights at (10,14), (16,14), (22,14), and (30,14), each constrained to a four-tile horizontal patrol range and separated into readable combat pockets.
- Hazard: one falling chandelier. Warning bounds (16,2)-(18,4); impact at (17,14). Do not overlap an unavoidable enemy attack.
- Sequence: enter and fight the first floor knight; climb to A; cross to B; return to the floor combat pockets; climb to the high platform; exit at the raised door.

## Room 3: Moonlit Gallery

- Purpose: vertical traversal lesson; 20 x 40 tiles; about 75 seconds; elevation +2 to +6.
- Entry: (0,30). Exit: (19,10). Floor collision: (0,30)-(19,31).
- Alternating platforms: (2,26)-(6,26), (12,22)-(16,22), (3,18)-(7,18), (11,14)-(15,14), and (4,10)-(8,10).
- Camera: vertical lock with a four-tile horizontal dead zone.
- Landmark: moonlit stained-glass window bounds (5,4)-(14,10).
- Props: chains at (3,20) and (15,16); gear at (10,28).
- Encounter: two flying specters at (10,24) and (10,18), each with a three-tile vertical patrol range.
- Hazard: spike strip (0,31)-(19,31), telegraphed across (0,30)-(19,30).
- Sequence: enter, wall-jump to P1, jump to P2, wall-jump to P3, air-dash to P4, climb to P5, and exit.

## Room 4: Wall-Jump Shrine

- Purpose: quiet ability shrine; 28 x 18 tiles; about 45 seconds; elevation +6 to +6.
- Entry: (0,12). Exit: (27,12). Floor collision: (0,12)-(27,13).
- Shrine platform: (12,10)-(15,10), centered in a symmetric composition.
- Camera: standard framing that center-locks on the shrine at (12,10).
- Landmark: altar bounds (12,10)-(15,12), backed by stained glass.
- Props: candle clusters at (11,10) and (16,10); tapestry bounds (8,4)-(10,8).
- No enemies, pits, hazards, secrets, or return gates.
- Sequence: enter, approach the altar, acquire Wall-Jump, read the reveal, and exit.

## Room 5: Upper Hall

- Purpose: mixed combat and traversal check; 36 x 20 tiles; about 70 seconds; elevation +6 to +4.
- Entry: (0,14). Exit: (35,12). Main floor collision: (0,14)-(35,15).
- Platforms: A (6,10)-(12,10), B (18,8)-(24,8), and C (26,6)-(30,6). Their rising asymmetry forms the readable W-style combat route with the floor pockets.
- Pit: (14,15)-(18,16), filled with spikes and preceded by the telegraph strip (14,14)-(18,14).
- Camera: horizontal follow with no more than two tiles of vertical adjustment.
- Landmark: arched gallery bounds (10,2)-(26,6), visible at entry.
- Props: broken pillar bounds (4,14)-(5,15); gear assembly bounds (22,14)-(24,16); structural pillars at x=8, x=20, and x=30.
- Encounter: melee enemies at (10,14), (16,14), and (28,14); flying enemies at (20,10) and (26,8); patrol range three tiles.
- Sequence: enter and clear the first pocket, wall-jump to A, air-dash to B, deal with the flying threat, return to the floor, clear the remaining pocket, climb to C, and exit.

## Screenshot review

Capture three frames per room:

- Entry: room purpose and primary landmark are readable immediately; exit direction is suggested without UI text.
- Midpoint: player, current landing surface, next landing surface, enemies, and hazard telegraphs remain visually separate.
- Exit: door silhouette is unambiguous and the next room's elevation and palette transition are hinted.

Reject a room when an unsupported floating platform is visible, decorative background exceeds the 15% gameplay coverage target, an enemy merges with the architecture, the character has less than four tiles of overhead clearance, or a hazard warning is hidden by props or effects.
