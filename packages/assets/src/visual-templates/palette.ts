import type { VisualReferenceAssetRole, VisualReferenceTemplate } from '@metroforge/schemas';
import type { EnemyArchetype } from '../png.js';

/** Hex "#rrggbb" -> [r,g,b], for feeding SpriteSpec.fill/accent (packages/assets/src/png.ts),
 *  which take [number,number,number,number] RGBA tuples rather than hex strings. */
export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

/**
 * Maps a template's asset role onto the live procedural fallback renderer's existing archetype
 * geometry (packages/assets/src/png.ts's ENEMY_ARCHETYPES) rather than inventing new body-part
 * shape functions — 'flying' and 'armored' already exist there with the exact silhouette this
 * milestone's task asked for; 'melee'/'ranged' map onto the closest existing distinct-silhouette
 * archetypes ('beast' reads as an aggressive ground melee attacker, 'caster' reads as a
 * ranged/projectile attacker via its staff+orb silhouette).
 */
const ROLE_TO_ARCHETYPE: Partial<Record<VisualReferenceAssetRole, EnemyArchetype>> = {
  enemy_melee: 'beast',
  enemy_ranged: 'caster',
  enemy_flying: 'flying',
  enemy_armored_heavy: 'armored',
};

export function archetypeForTemplate(template: VisualReferenceTemplate): EnemyArchetype | undefined {
  return ROLE_TO_ARCHETYPE[template.assetRole];
}

const ARCHETYPE_TO_ROLE: Partial<Record<EnemyArchetype, VisualReferenceAssetRole>> = Object.fromEntries(
  Object.entries(ROLE_TO_ARCHETYPE).map(([role, archetype]) => [archetype, role]),
) as Partial<Record<EnemyArchetype, VisualReferenceAssetRole>>;

/** Inverse of archetypeForTemplate — given an archetype the existing pickEnemyArchetype() already
 *  chose for an enemy id, finds which template role (if any) covers it. Returns undefined for
 *  'crawler'/'humanoid', which this reference library pass does not yet cover — callers must fall
 *  back to existing (non-template) behavior for those, not guess. */
export function roleForArchetype(archetype: EnemyArchetype): VisualReferenceAssetRole | undefined {
  return ARCHETYPE_TO_ROLE[archetype];
}

/** A template's fill/accent as RGBA tuples, in the order its palette array was authored (index 0
 *  = gameplay-meaning base color, index 1 = secondary/accent) — see
 *  artifacts/visual-reference-library-20260907/build_templates.mjs for the authored ordering. */
export function templateFillAccent(template: VisualReferenceTemplate): {
  fill: [number, number, number, number];
  accent: [number, number, number, number];
} {
  const [fillHex, accentHex] = template.palette;
  const fillRgb = hexToRgb(fillHex ?? '#808080');
  const accentRgb = hexToRgb(accentHex ?? fillHex ?? '#808080');
  return { fill: [...fillRgb, 255], accent: [...accentRgb, 255] };
}

/**
 * Terrain templates author `palette` as the full 7-color biome material set
 * [background, structure, armor, highlight, wear, wear2, hazard] (see build_templates.mjs's
 * ENVIRONMENT_FEATURES/BIOME_PALETTE) — maps that directly onto packages/assets/src/png.ts's
 * generateTilesetSource(seed, size, style) parameters: background is the darkest/shadow band,
 * structure the wall band, armor the ground/floor band (the brightest visible surface), and
 * wear/wear2 drive the corrosion/stain/vegetation/damaged-module overlay accents (never the
 * gameplay-meaning colors, which terrain templates never include).
 */
export function templateTilesetStyle(template: VisualReferenceTemplate): {
  groundColor: [number, number, number];
  wallColor: [number, number, number];
  shadowColor: [number, number, number];
  accentColor: [number, number, number];
  accentColor2: [number, number, number];
  features: readonly string[];
} {
  const [bg, structure, armor, , wear, wear2] = template.palette;
  return {
    shadowColor: hexToRgb(bg ?? '#1a1a1a'),
    wallColor: hexToRgb(structure ?? '#404040'),
    groundColor: hexToRgb(armor ?? '#707070'),
    accentColor: hexToRgb(wear ?? structure ?? '#8a5a3c'),
    accentColor2: hexToRgb(wear2 ?? bg ?? '#5a6a5a'),
    features: template.environmentFeatures,
  };
}

/** Same 7-color biome material set as templateTilesetStyle, converted to a plain RGB array in
 *  the exact positional order packages/assets/src/parallax-strip.ts's generateParallaxStrip
 *  already expects ([dark, mid, bright, ...]) — indices 4/5 (wear/wear2) double as its
 *  accent/accent2 for the material-feature overlay pass. */
export function templateBackgroundPalette(template: VisualReferenceTemplate): [number, number, number][] {
  return template.palette.map((hex) => hexToRgb(hex));
}

/** Props take fill/accent as hex strings directly (packages/assets/src/prop-art.ts), unlike
 *  enemies (RGBA tuples) or terrain (RGB tuples) — structure (index 1) as the primary material,
 *  wear (index 4) as the accent that feature overlays blend toward. */
export function templatePropFillAccent(template: VisualReferenceTemplate): { fill: string; accent: string } {
  const [, structure, , , wear] = template.palette;
  return { fill: structure ?? template.palette[0] ?? '#808080', accent: wear ?? template.palette[1] ?? '#808080' };
}
