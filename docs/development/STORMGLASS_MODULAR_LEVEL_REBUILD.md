# Stormglass modular side-view rebuild

The side-view world is assembled from collision tiles/platforms, separate façade modules, architectural props, parallax background pieces, lighting/VFX, and interactables with runtime logic. The top-down world remains a separate asset and level set.

## Current candidate

`E:/MetroForgeData/Development/stormglass-modular-levels-20261005-v1` preserves the previous source and saved room records. The shared region compiler emits 717 independent façade blocks, at most 256×256, aligned to the 32-pixel tile grid and explicitly non-colliding. Both the editor preview and Godot renderer consume their published coordinates. The renderer reuses the authored masonry texture and one shared material. Collision platforms, chamber boundaries, doorways, routes, and twenty furnishings remain independent.

Six compiler tests, desktop TypeScript checks and the desktop native build passed. The actual MetroForge app passed 22 checks, including all 717 displayed modules, compiler-plan saving, Undo restoring exact room records and collision, and data preservation. Seven native smoke checks passed. The source game completed actual-input ascent through all four stair routes, upper hall gaps, central return descent and both external doors in both directions, exiting zero after 454.5 seconds. These checks cover the first modular region, not the full rebuilt world. Native captures were inspected; background depth, chamber identity, rewards, and interactables still need development. Existing certificate-store diagnostics and ObjectDB shutdown warnings remain open.

## Playable Metroidvania Windows build

The isolated `windows/Play Stormglass.cmd` starts a Godot 4.6 x64 release with forty side-view rooms and keeps saves, settings, temporary files and logs on E:. The packed executable passed 47 GPU checks on the RTX 5060: all forty room scenes, published facade data, the authored masonry texture, actual input walking/jumping and clipped player atlas frames. The normal entry remains the title screen with New Game and three save slots.

The first release attempt rejected command-line scene overrides, which official release templates disable. A candidate-only game-owned probe entry now selects validation scenes using explicit user arguments. The earlier source-oriented smoke run is retained as failed: source-byte/file-enumeration assumptions do not apply to imported packed resources, and headless screenshots were unavailable. The packed fixture uses ResourceLoader and actual input events; it does not relax those earlier checks or claim their full coverage. Full packed region traversal is in progress in `release-region-traversal.log`; require its final proof and process exit before acceptance. This is a playable development candidate, not final art/presentation approval.

## Remaining rebuild requirements

- Structural kit: floor, wall, ledge, roof and trim tiles, with readable collision and cracked/mossy variants.
- Façade kit: reusable stone, wood and metal wall segments with independently authored placement.
- Props: windows, doors, banners, signs, sconces, pipes, shelves, balconies and condition details.
- Background depth: separate distant silhouettes and mid-ground towers/rooftops with measured parallax; avoid full building illustrations in the playable layer.
- Interactables: matching visual states and actual logic for gates, switches, breakable floors/doors, lifts and hidden passages.
- Level design: distinct room purposes, supported traversal, optional routes and rewards, deliberate encounters, boss spaces and reliable return paths.
- Verification: saved editor/compiler/native parity, foreground traversal, interaction checks, visual review and engine export evidence.

## Animation boundary fix

`E:/MetroForgeData/Development/stormglass-frame-isolation-20261005-v1` reproduces adjacent-frame GPU sampling using the actual Stormglass loader. The pre-fix loader contaminated a rotated linear-filtered frame with 312 neighbouring magenta pixels; atlas clipping reduced this to zero while preserving 56 authored frame regions. Source PNGs were unchanged. A separate read-only audit found 48 enemy attack/death frames touching the vertical cell edge; that content limitation is still pending source-art review and should not be hidden by destructive cropping.

## Unity route

The actual foreground Unity window was observed with a nonzero handle and Stormglass title. The source-bound ground-slam candidate reached victory through the 35-room required route with zero runtime exceptions. Eleven isolated ground-slam physics/lifecycle/input checks passed. Five optional rooms, gate coverage and NPC interaction remain open, and this export does not yet prove the modular region rebuild.
