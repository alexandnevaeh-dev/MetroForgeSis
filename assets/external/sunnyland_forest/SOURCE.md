# SunnyLand Forest - Source Provenance Record

## Pack Information
**Pack:** SunnyLand Forest

**Creator:** Ansimuz

**Official source:** https://ansimuz.itch.io/sunnyland-forest

**Pack Description:** Free pixel art pack for a side-scrolling platformer game. Includes tileset, sprites, props, enemies, and effects.

---

## License Verification

**Asset license:** Creative Commons Zero v1.0 Universal (CC0 1.0)

**Commercial use:** PERMITTED under CC0 1.0.

**Derivative modification:** PERMITTED under CC0 1.0.

**Attribution:** NOT REQUIRED under CC0 1.0. Creator credit may be retained voluntarily.

**Redistribution:** PERMITTED under CC0 1.0.

**Verification date:** 2026-09-01

**Verification basis:** Official itch.io asset page metadata identifies the asset license as Creative Commons Zero v1.0 Universal.

**Official page license verification:** CC0 1.0 Universal.

**Local archive license artifact:** `Sunny-land-forest-files/public-license.pdf` is present. Its text was not parsed during this work; this record does not claim it was.

---

## Archive Information

**Retrieved:** 2026-09-01

**Original Archive Filename:** `Sunny-land-forest-files.zip`

**Archive Size:** 3,791,236 bytes (3.6 MiB)

**Archive SHA-256:** `AAD985F40DCD1BA808B1CC9FD6C4FAC2D87F8F42B8BC4C8EB0E3EA59B54D9FF8`

**Archive Modified Date:** 2026-09-01 07:34:58 (itch.io download timestamp)

---

## Source Pack Contents

### Player Sprites
Individual frames (vertical organization):
- `player-idle`: 9 frames (idle standing animation)
- `player-jump`: 4 frames (jump/takeoff animation)
- `player-fall`: 4 frames (airborne fall animation)
- `player-duck`: 4 frames (crouch animation)
- `player-climb`: 4 frames (wall/rope climbing animation)
- `player-hurt`: 2 frames (damage feedback animation)
- `player-skip`: 8 frames (skip/hop animation)

### Player Spritesheets
Horizontal presentation-strip layout:
- Player frames are authored as 37×32 px individual PNG canvases with transparent padding.
- The presentation sheets use 37 px cells and spacer columns. Do not infer frame widths by dividing a sheet width by its frame count.
- `idle.png`: 9 frames in a 333×32 px presentation strip
- `jump.png`: 4 frames horizontal strip
- `fall.png`: 4 frames horizontal strip
- `duck.png`: 4 frames horizontal strip
- `climb.png`: 4 frames horizontal strip
- `hurt.png`: 2 frames horizontal strip
- `skip.png`: 8 frames horizontal strip

### Enemy Sprites
- Bee: 8 individual frames + horizontal spritesheet
- Piranha Plant (idle): 5 individual frames + horizontal spritesheet
- Piranha Plant (attack): 4 individual frames + horizontal spritesheet
- Slug: 4 individual frames + horizontal spritesheet

### Miscellaneous Assets
- Environment tileset, props, parallax layers
- Collectibles (star, carrot, chest)
- Effects (enemy death animation)
- UI elements (HUD graphics)

---

## Files Used for MetroForge Player Integration

**Player-Only Phase (Scope):**
Only player character sprites are being normalized and integrated during this phase.

### Selected Spritesheets for Normalization
- `Assets/PNG/spritesheets/player/idle.png` → Normalized to `normalized/player/idle.png`
- `Assets/PNG/spritesheets/player/jump.png` → Normalized to `normalized/player/jump.png`
- `Assets/PNG/spritesheets/player/fall.png` → Normalized to `normalized/player/fall.png`
- `Assets/PNG/spritesheets/player/duck.png` → Normalized to `normalized/player/duck.png`
- `Assets/PNG/spritesheets/player/climb.png` → Normalized to `normalized/player/climb.png`
- `Assets/PNG/spritesheets/player/hurt.png` → Normalized to `normalized/player/hurt.png`
- `Assets/PNG/spritesheets/player/skip.png` → Normalized to `normalized/player/skip.png`

**Excluded (Out of Scope):**
- Enemy sprites (bee, piranha-plant, slug) — reserved for Phase 2 (enemy migration)
- Environment assets — reserved for Phase 3+ (tileset/prop migration)
- Boss candidates — reserved for Phase 4+ (boss design)

---

## Project Modifications

### Normalization Steps (Phase 5 output)

The following transformations are applied to create gameplay-compatible assets:

#### Frame Canvas Standardization
- **Target Frame Size:** 64×64 pixels (fixed-grid standard, matches MetroForge sprite contract)
- **Original Player Frame Dimensions:** 37×32 px individual PNG canvases with transparent padding.
- **Original Player Sheet Layout:** Presentation sheets include spacer columns and must not be sliced by dividing total width by frame count.
- **Conversion Process:**
  1. Load authored individual frames rather than slicing presentation sheets
  2. Center each frame on 64×64 canvas
  3. Ensure transparency beyond frame content
  4. Verify alpha channel integrity (no compression artifacts)

#### Pivot/Origin Convention
- **Target Origin:** Bottom-center (foot-anchored, floor contact)
- **Reference Height:** Character visual height ~52-56 px within 64×64 canvas
- **Foot Position:** Consistent Y-coordinate across all animations (baseline stability)
- **Method:** Frame padding adjusted so sprite feet align at canvas Y=60-62 (near bottom)

#### Animation Metadata
- **Frame Rate Mapping:** Source pack FPS → MetroForge gameplay state FPS (may differ for game-feel)
- **Loop Behavior:** Configured per-state (idle/walk loops; hurt/death non-looping)
- **Frame Count Verification:** Each normalized sheet verified for correct frame count
- **Facing Convention:** Right-facing primary; sprite system applies horizontal flip for left-facing

#### Quality Checks
- **Alpha Channel Validation:** No premultiplied alpha; clean transparency
- **Occupancy Check:** Each frame has visible content (no empty frames)
- **Duplicate Detection:** No duplicate frames within animation strips
- **Baseline Variance:** Foot position variance ≤2 pixels across clip
- **Scale Variance:** Character height variance ≤3% across animations

#### Color Space & Compression
- **Target Format:** PNG 32-bit RGBA (uncompressed layer compositing)
- **Palette Handling:** No indexed color; true color RGB + alpha
- **Resampling:** Nearest-neighbor only; no Lanczos, bicubic, bilinear, or antialiasing
- **Mipmap Preparation:** Not required for 64×64 sprites

---

## Integration Status

### Phase 1: Inspection ✅ COMPLETE
- Current V2 player specifications documented
- Animation state count: 26 states
- Current frame dimensions: 64×64 px
- Collision geometry verified: 24×48 body, 20×44 hurtbox, 30×24 hitbox

### Phase 2: Source Acquisition ✅ COMPLETE
- Official SunnyLand Forest pack downloaded and verified
- License verified as CC0 1.0 (commercial use confirmed)
- Source provenance recorded in this file
- Archive SHA-256 verified for integrity

### Phase 3: Provenance ✅ COMPLETE
- Original files preserved untouched at `assets/external/sunnyland_forest/original/`
- SOURCE.md created with complete verification
- Modification list documented

### Phase 4: Player Asset Inventory 🔄 IN PROGRESS
- Available player animations catalogued
- Gap analysis to 26 MetroForge states pending

### Phase 5: Normalization ⏳ PENDING
- Frame canvas normalization
- Pivot/baseline standardization
- Metadata creation

### Phase 6: Godot Integration ⏳ PENDING
- AnimatedSprite2D/SpriteFrames setup
- Animation metadata JSON creation

### Phase 7: Game-Feel Check ⏳ PENDING
- Responsiveness validation
- Timing alignment verification

### Phase 8: Quality Gate ⏳ PENDING
- V2 vs V3 side-by-side comparison
- Visual and technical evaluation

### Phase 9: Validation ⏳ PENDING
- Project load test
- Animation playback test
- Gameplay integration test

---

## Provenance Statement

This source pack is confirmed as:
- **Legally verified:** CC0 1.0 license explicitly confirmed
- **Commercial use:** Permitted without restriction
- **Derivative works:** Permitted without restriction
- **Attribution:** Optional (not required)
- **Provenance:** Original files preserved untouched for audit trail

**Integration Status:** APPROVED FOR NORMALIZATION

Any derivative works produced from this source are documented in the "Project Modifications" section above and stored in `normalized/player/` subdirectories.

---

**Record Created:** 2026-09-01  
**Prepared by:** MetroForge Character Art V3 Quality Gate Workflow  
**Next Action:** Proceed to Phase 4 (Player Asset Inventory)
