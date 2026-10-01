/**
 * Hard biome material / pattern rejection for tile + prop selection.
 * Soft scores (scoreRoomEnvironment / scoreTopDownRoom) still use biomeMaterialMatch;
 * this module is the reject gate at pick time — not a score-only hint.
 */
import type { BiomeVisualDNA, MaterialLanguage } from '@metroforge/schemas';

export type BiomeConsistencyContext = Pick<
  BiomeVisualDNA,
  | 'biomeId'
  | 'displayName'
  | 'forbiddenPatterns'
  | 'terrainMaterials'
  | 'organicMaterials'
  | 'propFamilies'
  | 'architecturalFamilies'
  | 'foregroundLanguage'
  | 'midgroundLanguage'
  | 'backgroundLanguage'
>;

/** Motif-level material bans layered on top of VisualDNA.forbiddenPatterns. */
const MOTIF_MATERIAL_BANS: Array<{ match: RegExp; ban: string[] }> = [
  {
    match: /foundry|pouring|quench|cooling.?yard|ashen|clockwork|citadel|mechanical/i,
    ban: [
      'pastoral forest',
      'pine forest',
      'pine forest vista',
      'grass meadow',
      'soft foliage',
      'flower bed',
      'alpine lake',
      'cute rounded toys',
      'soft watercolor wash',
    ],
  },
  {
    match: /drowned|masonry|crypt|gothic/i,
    ban: ['desert sand dune', 'neon vaporwave', 'pastoral forest', 'pine forest vista'],
  },
  {
    match: /grove|moonlit|overgrown|organic|spore|fungal|mycelium|glowcap|underdark/i,
    ban: [
      'riveted bulkhead collage',
      'furnace slag wallpaper',
      'photoreal people',
      'industrial foundry',
      'cyan robot courier',
      'slag brick wallpaper',
    ],
  },
  {
    match: /coastal|cliff|tide|temple|sandstone|sea.?worn|colonnade|shrine|misty coastal/i,
    ban: [
      'riveted bulkhead collage',
      'furnace slag wallpaper',
      'industrial foundry',
      'cyan robot courier',
      'slag brick wallpaper',
      'panel grates',
      'fungal underdark',
      'glowcap colonnades',
      'mycelium weave',
    ],
  },
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenHit(haystack: string, needle: string): boolean {
  if (!needle || !haystack) return false;
  if (haystack.includes(needle) || needle.includes(haystack)) return true;
  // Multi-word overlap only — require ≥2 tokens of length ≥5 so "pine" does not false-hit "alpine".
  const parts = needle.split(' ').filter((p) => p.length >= 5);
  return parts.length >= 2 && parts.every((p) => haystack.includes(p));
}

function materialForbidden(materials: MaterialLanguage[]): string[] {
  return materials.flatMap((m) => m.forbidden ?? []);
}

/** All hard-reject tokens for a biome (patterns + material.forbidden + motif bans). */
export function collectBiomeForbiddenTokens(biome: BiomeConsistencyContext): string[] {
  const motifBans = MOTIF_MATERIAL_BANS.filter((entry) =>
    entry.match.test(`${biome.displayName} ${biome.biomeId}`),
  ).flatMap((entry) => entry.ban);
  const tokens = [
    ...biome.forbiddenPatterns,
    ...materialForbidden(biome.terrainMaterials),
    ...materialForbidden(biome.organicMaterials),
    ...motifBans,
  ]
    .map(normalize)
    .filter(Boolean);
  return [...new Set(tokens)];
}

export function collectBiomeAllowedTokens(biome: BiomeConsistencyContext): string[] {
  const tokens = [
    ...biome.propFamilies,
    ...biome.architecturalFamilies,
    ...biome.foregroundLanguage,
    ...biome.midgroundLanguage,
    ...biome.backgroundLanguage,
    ...biome.terrainMaterials.map((m) => m.name),
    ...biome.terrainMaterials.map((m) => m.family),
    ...biome.organicMaterials.map((m) => m.name),
    ...biome.organicMaterials.map((m) => m.family),
    biome.displayName,
  ]
    .map(normalize)
    .filter(Boolean);
  return [...new Set(tokens)];
}

/**
 * Hard reject: candidate matches a forbidden pattern/material token.
 * Candidates with no forbidden hit are allowed (caller may still filter to biome kit).
 */
export function isForbiddenInBiome(candidate: string, biome: BiomeConsistencyContext): boolean {
  const hay = normalize(candidate);
  if (!hay) return true;
  return collectBiomeForbiddenTokens(biome).some((token) => tokenHit(hay, token));
}

export function propAllowedInBiome(propIdOrFamily: string, biome: BiomeConsistencyContext): boolean {
  return !isForbiddenInBiome(propIdOrFamily, biome);
}

export function tileAllowedInBiome(tileRoleOrMaterial: string, biome: BiomeConsistencyContext): boolean {
  const hay = normalize(tileRoleOrMaterial);
  // Moss / organic wear is only legal when the biome carries organic materials language.
  if (/\bmoss\b|vegetation|foliage|vine|leaf litter/.test(hay)) {
    const hasOrganic =
      biome.organicMaterials.length > 0 ||
      biome.propFamilies.some((p) => /moss|vine|leaf|fern|vegetation/i.test(p)) ||
      /grove|overgrown|moonlit|organic/i.test(`${biome.displayName} ${biome.biomeId}`);
    if (!hasOrganic) return false;
  }
  return !isForbiddenInBiome(tileRoleOrMaterial, biome);
}

export function filterAllowedProps<T extends string>(candidates: T[], biome: BiomeConsistencyContext): T[] {
  return candidates.filter((c) => propAllowedInBiome(c, biome));
}

export function filterAllowedTileVariants<T extends string>(
  variants: readonly T[],
  biome: BiomeConsistencyContext | undefined,
): T[] {
  if (!biome) return [...variants];
  return variants.filter((v) => tileAllowedInBiome(v, biome));
}

/** True when candidate shares vocabulary with biome materials / prop families (for soft scores). */
export function biomeMaterialMatches(candidate: string, biome: BiomeConsistencyContext): boolean {
  if (isForbiddenInBiome(candidate, biome)) return false;
  const hay = normalize(candidate);
  const allowed = collectBiomeAllowedTokens(biome);
  if (allowed.length === 0) return true;
  return allowed.some((token) => tokenHit(hay, token));
}

/**
 * Minimal context when only a biome id is known at tile-paint time (room assembler).
 * Moss/organic wear is allowed for overgrown / grove / biome_* ending in 2 (foundry slice).
 */
export function minimalBiomeContextFromId(biomeId: string, displayName?: string): BiomeConsistencyContext {
  const id = biomeId || 'biome_0';
  const name = displayName ?? id;
  const organicOk =
    /overgrown|grove|moonlit|organic|cooling.?yard/i.test(`${name} ${id}`) || /(?:^|_)(?:biome_)?2$/.test(id);
  return {
    biomeId: id,
    displayName: name,
    forbiddenPatterns: [],
    terrainMaterials: [],
    organicMaterials: organicOk
      ? [
          {
            id: 'organic',
            name: 'organic',
            family: 'organic',
            albedo: '',
            roughness: '',
            edgeTreatment: '',
            forbidden: [],
          },
        ]
      : [],
    propFamilies: [],
    architecturalFamilies: [],
    foregroundLanguage: [],
    midgroundLanguage: [],
    backgroundLanguage: [],
  };
}
