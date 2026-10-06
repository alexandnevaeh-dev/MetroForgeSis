# Top-down redesign — Verdant Ruins

User direction, 2026-09-29: redo the entire top-down design. Stylized pixel art, rich colors, strong silhouettes, detailed environments. Existing top-down visuals are rejected and remain comparison fixtures. Metroidvania remains a separate set.

## Visual rules

Use original three-quarter overhead pixel artwork, with visible tops and short front faces. Build at a consistent 32px terrain grid; player footprint 20px and art approximately 32–40px tall at native scale. Use nearest filtering, integer screen scaling, fixed feet anchors, deliberate pixel clusters and no mixed-resolution painted sprites. Jade foliage, deep blue-violet shadows, desaturated warm stone, ochre paths and restrained turquoise water form the environment palette. The player uses a warm coral cloak, cream accents and a dark silhouette so it reads immediately against foliage. Reserve bright gold for interactable rewards and clear warm-red telegraphs for danger.

Quiet ground supports detailed landmarks: avoid checkerboard paving, per-tile high-contrast cracks and random noise. Create grass/path transitions, pond edges, stone corners, wall tops/fronts and damaged variants as an authored terrain family. Canopies and architecture use feet-based sorting and an occlusion fade when the player moves behind them. No decorative object may look walkable while blocking movement.

## First playable slice

A sheltered southern clearing introduces movement. An ochre path bends past a small eastern pool toward a broken arch. Two routes circle the pool: a safe outer path and a short enemy-guarded inner route. A visible chest sits in a western alcove reached by a branching path, not random scatter. Crossing the arch enters a compact ruined court; a switch opens a visible gate and a return shortcut. A rest alcove precedes a clear boss arena with a readable perimeter and enough space to dodge. Encounters have preparation space and recovery space. Every required objective must be reachable with the actual player collision body.

## Animation production

Create purpose-built N/NE/E/SE/S/SW/W/NW character facings with consistent costume, weapon hand, scale and foot anchor. Idle 4–6 poses, walk 8, run 8–12, attack 8–12, hurt 3–4 and death 6–8 are initial authoring budgets, not a global playback speed. Walk requires distinct contact, compression, passing and push-off poses; run needs a separate gait. Preserve normalized gait phase when changing direction or speed. Attack metadata owns anticipation, active contact and recovery. Do not turn one still into fake locomotion by sliding, bobbing or rotating it.

## Interface

Compact, pixel-aligned HUD with readable health, stamina and equipped ability. A small objective line appears only when useful; interaction labels anchor to the nearby object. The map and pause panel use the same palette, type scale and icon family. Replace debug Item blocks, default bars and unexplained purple portals.

## Production and tests

All files, caches and model work remain on E:. Top-down uses GeneratedGames/test-games/topdown; Metroidvania uses GeneratedGames/test-games/metroidvania. Each keeps its own saves, provenance, backups, assets, audio and gameplay captures. Source art is immutable; revisions receive new identities.

Before promotion: inspect texture seams and transparency, validate exact sprite dimensions and directional coverage, then run native movement, collision, attack timing, room transitions and boss victory. Capture idle, traversal and combat at actual playing scale plus continuous motion. Technical passes do not override visual rejection or mean user approval. The first local image is a concept only, never a substitute for a tileset or gameplay capture.

## Reference scope

[CrossCode official press kit](https://www.radicalfishgames.com/presskit/sheet.php?p=crosscode) provides a reference for a coherent 2D pixel-art action RPG. [Heart Machine](https://www.heartmachine.com/home) identifies Hyper Light Drifter as a reference title. These are reference sources, not licensed asset sources. No frame-by-frame motion measurement or copying of characters/environment art is claimed.

## Current status

Direction selected. Old top-down visuals rejected. Native test infrastructure and genre separation repaired; new production art, complete new room kit, interface, directional motion family and end-to-end redesign are still in progress.
