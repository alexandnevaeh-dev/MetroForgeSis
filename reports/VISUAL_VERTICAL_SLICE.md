# Visual Vertical Slice — Human Review Packet (iteration)

**Status: VISUAL_SLICE_REVIEW_REQUIRED**  
**Not: FULL GAME READY**  
**Do not start P8 / P9 / a 40+ room release candidate.**

Heart of the Drowned remains the technical regression checkpoint at git tag `heart-engine-p7-technical-checkpoint` (`7269970`). Do not delete it.

Generated slice project (this pass):

`apps/cli/GeneratedGames/dusk-glass-lantern-keep`  
profile `VISUAL_VERTICAL_SLICE`, seed **77**, 10 rooms.

Studio human gate: **Approve Visual Direction** / **Reject / Request Revision**.  
MASS art for LARGE / RELEASE_CANDIDATE stays blocked until `visualSliceApproved === true`.

---

## What this iteration changed (pipeline + existing slice)

- Knocked pale/studio backgrounds to **alpha** on player/enemy/NPC/boss stills and rebuilt fake walk/hurt/attack/death sheets from those stills. `player.png` is now RGBA with most pixels transparent (verified).
- Sprite feet-anchor and nearest filtering in `AnimatedAssetSprite`.
- Hid FloorVisual / room-transition ColorRects; QualityPresentation no longer injects ColorRect “pillar” decor or duplicate full-bleed plates when `ParallaxBg` or `Ground` exists.
- TileMapLayer paints a floor band + one dado row + side walls at runtime (`_paint_visual_mass`). Atlas is 32px navy bevel blocks.
- HUD: thicker health bar; smoke leftover `test_*` abilities are filtered from the label.
- Camera zoom remains integer **3**. Recapture: windowed GPU **d3d12** on Intel UHD.

## Honest visual finding (do not treat as approved)

Windowed D3D12 screenshots were recaptured after the knockout + slab hide. They are **better as files** (alpha exists; opaque FloorVisual/transition rects are gone) but **still fail human review** as a coherent Metroidvania room:

- The player still reads as a **tiny hat/coat silhouette** with a **mustard ground blob**. Some shots still show a pale boxed region around the actor (atlas/halo/yellow patch), not a stable in-world sprite with interior costume detail.
- Side walls are real TileMap cells, but the compiled atlas is **near-black navy bevels**, so they photograph as **opaque dark slabs**. The dusk plate is still the dominant picture.
- Flux.1-Kontext hosted preview **still 422**. Probe body: `Expected: example_id, got: base64`. The cloud endpoint only accepts canned `data:image/png;example_id,{0-2}` images — **not custom sprites**. Animation generation **STOPPED**. Bob/slide sheets are **not production-ready**.
- HUD is Godot fonts, slightly thicker bar, no `test_probe_ability` — still a **debug-like** strip of labels + minimap.
- Background is still one (or two misaligned) **FLUX dusk plate(s)**, not true far/mid/near parallax. Horizontal seams remain.

A deterministic critic PASS is **not** aesthetic approval.

---

## StyleBible (locked)

- artStyle: dusk-glass canyon keep, pixel side-view
- tileSize: **32**
- player sprite canvas: **64×64**
- cameraZoom: **3** (integer)
- nearestNeighbor: true
- animationFPS: 10 target (posed frames did not generate)

## Provider / model

- NVIDIA Flux.1-dev: concept stills / tileset source / backgrounds (existing assets)
- NVIDIA Flux.1-Kontext-dev: **HTTP 422** `Expected: example_id, got: base64` — STOP
- Deterministic TileCompiler: gameplay tileset atlas (dark navy; low interior detail)

## Technical vs aesthetic

| Gate | Result |
|---|---|
| 10 connected rooms | Yes |
| Windowed GPU recapture (d3d12) | Succeeded after Godot `--import` |
| Sprite PNG alpha | Improved (player still has leftover yellow blob) |
| Sprite identity animation | **FAIL — Kontext hosted preview cannot take custom images** |
| In-room tileset read | Tiles paint, but look like dark slabs over a dusk plate |
| Human visual approval | **REQUIRED — not granted** |

## Human rubric (1–5, you score these)

Art coherence · Player readability · Environment coherence · Tileset quality · Animation quality · Lighting/depth · Combat readability · VFX integration · Room composition · HUD · Boss presentation · Overall polish

## Screenshots

- `reports/01-start.png`
- `reports/02-traversal.png`
- `reports/03-combat.png`
- `reports/04-vertical-room.png`
- `reports/05-ability-room.png`
- `reports/06-secret.png`
- `reports/07-checkpoint.png`
- `reports/08-boss-room.png`
- `reports/09-boss-combat.png`
- `reports/hud.png`
- `reports/tileset-test.png`
- `reports/biome-layers.png`
- `reports/visual-slice-contact-sheet.png`

Player/enemy/boss **posed** contact sheets were **not** produced. Animation remains STOP.

---

**STOP.** Do not expand content until you approve or reject these screenshots.
