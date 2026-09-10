# MetroForge visual style guide — industrial sci-fi Metroidvania

Fourteenth session (2026-09-07). This is the shared visual specification new generated assets are
expected to follow. It is **extracted and generalized from the QA-approved `metroforge-foundry-v3`
pack** (`artifacts/metroforge-foundry-v3-20260906-01/VISUAL_SPEC.md`, reviewer
`claude-code:delegated-visual-qa-2026-09-06-r2`) — that pack is the initial visual baseline, not a
new creative direction. This document is a human-readable expansion of the machine-readable
[`visual-constitution.json`](reference-library/visual-constitution.json) (validated against the
repository's real `VisualConstitutionSchema`, `packages/schemas/src/visual-constitution.ts`) — the
two must stay in sync; the JSON is the source of truth consumed by code, this file is the
explanation for people.

**Provenance discipline**: this guide and everything under `reference-library/` is the product of
an AI-delegated extraction/authoring pass, not the user's own personal visual sign-off. See
[`reference-library/PROVENANCE.md`](reference-library/PROVENANCE.md).

## 1. Pixel density, canvas, actor scale, anchors

| | Value |
|---|---|
| Native character/enemy frame | 128×128px |
| Native boss frame | 160×160px |
| Foot pivot (character/enemy) | (64, 120) |
| Foot pivot (boss) | (80, 148) |
| Body height (player / melee / ranged / boss) | ~68 / ~64 / ~76 / ~125 px |
| Tile grid | 32×32px |
| Logical game viewport | 960×540 |
| Boss scale vs. player | ~2× |

Actors are **3-head-scale compact armored/mechanical bipeds** except the flying archetype (no
legs — a hovering chassis). See [`reference-library/player/player-construction-guide.png`](reference-library/player/player-construction-guide.png).

## 2. Perspective, facing, outlines, shading, lighting, material

- **Perspective**: orthographic side-view platformer.
- **Facing**: right-facing sheets are the source of truth. Left-facing is a horizontal mirror,
  including which side equipment renders on — this is disclosed, not hidden, in every pack that
  uses it.
- **Outline**: restrained 1px dark contour (`#101c29`), with selective pale upper-edge highlights
  on beveled armor planes — not a uniform outline weight.
- **Lighting**: upper-left key light, cool and slightly diffuse. Bright steel upper planes, dark
  blue-black joint cavities. Ambient fill is biome-tinted; emissive accents are gameplay-meaning
  only (see §3).
- **Material**: interior mid-tone values must be preserved. Flattening a surface to near-black or
  near-white is a shading defect, not a stylistic choice. Rivets, panel seams, and engraved joins
  stay visible at native resolution.

## 3. Palette roles

Two palette tiers exist, and they must not be confused:

**Gameplay-meaning colors — constant across every biome** (a player must be able to read game
state without knowing which biome they're in):

| Role | Hex |
|---|---|
| Player / interaction | `#63dbe0` (cyan) |
| Enemy base | `#b95d3e` (rust) |
| Enemy secondary | `#e39b58` (orange) |
| Boss / hazard / telegraph | `#efbd61` (amber) |
| Outline / ink | `#101c29` |

**Biome material palettes — environment dressing only**, never applied to a gameplay-meaning
color:

| Biome | Background | Structure | Armor/highlight | Distinguishing material |
|---|---|---|---|---|
| Foundry | `#131e2c` | `#384d60` | `#a9c3cb` / `#e1e4cf` | warm furnace glow, dark steel |
| Flooded utility sector | `#101f22` | `#2e4f4d` | `#9fc7c2` / `#d8ece6` | oxidized teal metal, water |
| Overgrown reactor | `#16241a` | `#3a4f3a` | `#b9c9a0` / `#e2ecc9` | luminous green growth |

See [`reference-library/style-sheets/character-motion-guide.png`](reference-library/style-sheets/character-motion-guide.png)'s palette-role row for a rendered swatch.

## 4. Animation framing, weapon clearance, transparency, export

- Diffusion or other generated reference material informs material/silhouette ideas only; final
  actor pixels are **manually authored articulated part geometry** — never diffusion-retained
  pixels (disclosed in every pack's provenance).
- No whole-sprite sliding, tinting, or single-still relabeling counts as an animation clip.
- Attack clips require windup → extension/strike → recovery at minimum.
- Death clips collapse articulated body parts with a **per-actor** fall direction/magnitude — a
  shared tip-over across every actor is a defect (this was a real Twelfth-session finding, fixed).
- Weapon clearance: extended weapons (ranged cannon, boss hammer) are excluded from the collision
  rectangle; hitboxes activate at metadata strike timing, not on frame 0.
- Export: transparent-background PNG sheets, fixed frame size, per-frame event metadata
  (`strike` frame, etc.) alongside the sheet — see any `*.json` sidecar in
  `test-packs/metroforge-foundry-v3/`.

## 5. Terrain, traversal, props, backgrounds

- **Terrain** is an explicit modular kit — floor / wall / ceiling / platform / outer-corner /
  inner-corner / transition — with defined adjacency, not automatic tile-peering. Every biome
  exposes the same role set so room-composition logic stays biome-agnostic (only material/wear
  changes per biome). See [`reference-library/terrain/`](reference-library/terrain/).
- **Traversal** elements (door, lift, breakable barrier, one-way platform, ability gate) are
  visually distinct from decorative terrain and from each other; ability gates are color-coded by
  the ability they require, and that color coding is biome-neutral (a dash gate is cyan in every
  biome). See [`reference-library/traversal/`](reference-library/traversal/).
- **Props/gameplay objects** (machinery, pipes, crates, lights, checkpoints, pickups, hazards,
  projectiles, exit markers) use flat rounded-rectangle/cylinder geometry with a single accent
  stripe or window; biome dressing changes surface material only. See
  [`reference-library/props/`](reference-library/props/).
- **Backgrounds** are three depth layers (far/mid/near) with decreasing detail/contrast toward
  far, so foreground gameplay elements stay readable against them. See
  [`reference-library/backgrounds/`](reference-library/backgrounds/).

## 6. What this guide does not claim

- Reference sheets in `reference-library/` are **concept/reference art**, watermarked
  "CONCEPT REFERENCE — NOT A SPRITE ATLAS" (or the bottom-bar equivalent) on every rendered board.
  They are not themselves a compiled, game-ready sprite pack — a compiled pack (like
  `test-packs/metroforge-foundry-v3/`) is a separate, QA-reviewed artifact.
  A static pose sheet does not prove animation quality in motion — see the reference-library's
  own `player-pose-guide.png` disclosure that its jump/fall poses are synthesized concept poses,
  not compiled clips, and see the fourteenth-session audit entry for what the bounded sample
  actually verified in a running project versus what remains unverified.
- Text prompting toward this style guide does not guarantee visual consistency by itself — see
  `docs/asset-pipeline/reference-library/templates/README.md` for how the template schema
  separates fixed identity constraints (never vary) from allowed procedural variation (may vary
  per seed), and the fourteenth-session audit entry for what the integration actually enforces
  versus what still relies on manual review.

## 7. Adding a fourth biome

1. Add a `palette.biome.<new_biome_id>` entry to `visual-constitution.json` (background,
   structure, armor/highlight, one or two distinguishing material colors) — reuse every existing
   gameplay-meaning color unchanged.
2. Add a `BIOMES['<new_biome_id>']` entry to
   `artifacts/visual-reference-library-20260907/build_reference_library.py` with the same hex keys,
   then rerun the script — it produces the tile kit, connected-room sample, props sheet, traversal
   sheet, and background layers for the new biome automatically, using the same construction code.
3. Add matching `VisualReferenceTemplate` JSON instances under `reference-library/templates/` for
   whichever asset roles the new biome should override (see
   `reference-library/templates/README.md`).
4. Re-run `pnpm exec vitest run packages/schemas/src/visual-reference-template.test.ts
   packages/assets/src/visual-templates/*.test.ts` to confirm the new templates validate and
   resolve.
