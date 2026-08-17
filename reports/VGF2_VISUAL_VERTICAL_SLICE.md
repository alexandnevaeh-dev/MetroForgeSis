# VGF-2 Visual Vertical Slice

**Project:** vgf2-tideglass-nave  
**Seed:** 20260817  
**Profile:** VISUAL_VERTICAL_SLICE  
**Archetype:** SIDE_VIEW_METROIDVANIA  
**Automated verdict:** AUTOMATED_VISUAL_PASS_HUMAN_REVIEW_REQUIRED  
**Human verdict:** HUMAN_REJECTED

Human rejection recorded 2026-08-16 (America/Chicago) after review of the VGF-2 stills. LARGE / RELEASE_CANDIDATE mass art stays blocked.

## Provider / model

- mode: NVIDIA_ONLY
- nvidiaImage: black-forest-labs/flux.1-dev
- selectedImage: nvidia-image
- identity / Kontext custom-reference: unavailable (hosted preview does not accept custom sprites; pose AI upgrade disabled)

## VisualDNA

- fingerprint: `c837cdafdc1603d6`
- art style: readable gothic pixel ruin (`gothic-ruin`)
- rendering: Readble Modern Indie Pixel Art
- biome: Glass Citadel (`biome_0`)
- lighting language: cold cyan key, submerged dusk ambient, desaturated gold accents

## Asset maturity (generation-time)

- production-ready: 0
- placeholder: 90
- rejected: 9
- unknown license: 0
- generated assets: 189 (180 critique pass)

Placeholder count is honest: UI/prop foundry and deterministic poses are procedural fallbacks, not NVIDIA stills.

## Godot validation (post RoomTileMap + parallax patch)

| Gate | Result |
|---|---|
| godot_imports | PASS (Godot 4.7.1 headless OK) |
| godot_runtime | PASS / SOFT_FAIL 183–184 / 208 (headless dummy renderer cannot `texture_2d_get`; gameplay checks otherwise pass) |
| gameplay_screenshot_qa | PASS score **100** after windowed_gpu recapture (`d3d12`) |
| godot_playtest | PASS 8/8 — persona `victory_rusher`, 38008ms, `gameComplete: true`, rooms 000–009 |

CLI `metroforge validate` does not re-run playtest; playtest evidence is from the original generation run of this project.

## Visual QA scores (pipeline Visual Quality Director V2)

Scores below were computed at generation time from occupancy/luma heuristics plus parallax fingerprints. They are **not** a substitute for looking at the recaptured stills.

- characterReadability: 92
- enemyReadability: 82
- silhouetteQuality: 92
- paletteHarmony: 90
- paletteSeparation: 100
- materialConsistency: 95
- architectureConsistency: 95
- backgroundDepth: 86
- parallaxReadability: 86
- lightingQuality: 82
- environmentCoherence: 95
- propDensity: 90
- tileRepetition: 35
- composition: 55 (pre-recapture critic); windowed recapture critic score is **100**
- focalHierarchy: 92
- hudReadability: 88
- vfxReadability: 78
- assetStyleConsistency: 86
- overall: 81

## Defects

- TILE_REPETITION_HIGH (occupancy heuristic; recaptured rooms still show repetitive masonry blocks)
- First-run captures showed opaque mid/near silhouette **slabs** across the playable frame. Those layers were regenerated as sparse colonnade / chain occluders and recaptured. That defect is **source-fixed**; it is not auto-marked repaired in the generation-time repair log.

## Hard-fail reasons

- none after recapture
- Headless wallpaper/HUD-obstruction (score 55) was a dummy-renderer + stale-capture artifact, not the windowed_gpu still

## Repairs

- none applied by the bounded lighting-only repair loop during generation
- Manual acceptance patch after generation: RoomTileMap typed hashing (`c49055f`); mid/near parallax regenerated as sparse architecture; FloorVisual hide walks all floor segments

## Screenshots

Project-local captures (windowed GPU, after parallax patch):

- `GeneratedGames/vgf2-tideglass-nave/reports/01-start.png`
- `GeneratedGames/vgf2-tideglass-nave/reports/02-traversal.png`
- `GeneratedGames/vgf2-tideglass-nave/reports/03-combat.png`
- `GeneratedGames/vgf2-tideglass-nave/reports/04-vertical-room.png`
- `GeneratedGames/vgf2-tideglass-nave/reports/05-ability-room.png`
- `GeneratedGames/vgf2-tideglass-nave/reports/07-checkpoint.png`
- `GeneratedGames/vgf2-tideglass-nave/reports/08-boss-room.png`
- `GeneratedGames/vgf2-tideglass-nave/reports/hud.png`
- `GeneratedGames/vgf2-tideglass-nave/reports/visual-slice-contact-sheet.png`
- `GeneratedGames/vgf2-tideglass-nave/qa/screenshot_gameplay.png`

Repo copies (this folder):

- `reports/vgf2/01-start.png`
- `reports/vgf2/03-combat.png`
- `reports/vgf2/08-boss-room.png`
- `reports/vgf2/visual-slice-contact-sheet.png`
- `reports/vgf2/qa-gameplay.png`

## Capture notes

- Godot `--headless` uses the dummy renderer; `texture_2d_get` is null. Evidence stills require `windowed_gpu` / `--rendering-driver d3d12`.
- Slice luma-grid diversity was 7.5. Identical-copy detection remains (`< 6`). Cohesive single-biome rooms are allowed to look like one art direction.

## Human review

**HUMAN_REJECTED** by the project owner after inspecting the recaptured stills.

Reasons preserved:

- `TILE_REPETITION_HIGH` — masonry platforms/walls still read as repeating grey cubes, not art-directed terrain.
- Character identity is insufficient in gameplay: player/enemies are small or placeholder-like versus the far plate; identity packs did not produce a readable in-world silhouette.
- Props remain neon/blockout blobs.
- HUD is raw text and a red bar, not production UI.
- 0 production-ready assets / 90 placeholders — slice is not commercially believable art direction.

`visual_review.json` status: `VISUAL_SLICE_REJECTED`. Global gate: `.metroforge/visual-slice-approval.json` (`visualSliceApproved: false`).
