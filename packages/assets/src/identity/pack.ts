import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CharacterIdentityPack, CharacterVisualDNA, VisualDNA } from '@metroforge/schemas';
import { decodePngRgba, encodePng } from '../png.js';

export function identityPackDir(characterId: string): string {
  return `assets/characters/${characterId}/identity`;
}

export function buildSilhouettePng(source: Buffer): Buffer {
  const { rgba, width, height } = decodePngRgba(source);
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3]!;
    if (a < 16) continue;
    out[i] = 8;
    out[i + 1] = 10;
    out[i + 2] = 14;
    out[i + 3] = 255;
  }
  return encodePng(width, height, out);
}

export function extractPaletteJson(source: Buffer, fallback: string[]): { hex: string[]; counts: number } {
  const { rgba } = decodePngRgba(source);
  const buckets = new Map<string, number>();
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3]! < 32) continue;
    const r = rgba[i]! >> 4;
    const g = rgba[i + 1]! >> 4;
    const b = rgba[i + 2]! >> 4;
    const hex = `#${[r * 17, g * 17, b * 17].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    buckets.set(hex, (buckets.get(hex) ?? 0) + 1);
  }
  const hex = [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([h]) => h);
  return { hex: hex.length > 0 ? hex : fallback, counts: buckets.size };
}

export function writeCharacterIdentityPack(input: {
  outputDir: string;
  characterId: string;
  role: CharacterIdentityPack['role'];
  source: Buffer;
  visualDNA: VisualDNA;
  characterDna?: CharacterVisualDNA;
  animationTier: CharacterIdentityPack['animationTier'];
  posePaths?: Record<string, string>;
}): CharacterIdentityPack {
  const relDir = identityPackDir(input.characterId);
  const absDir = join(input.outputDir, relDir);
  mkdirSync(absDir, { recursive: true });
  writeFileSync(join(absDir, 'source.png'), input.source);
  const silhouette = buildSilhouettePng(input.source);
  writeFileSync(join(absDir, 'silhouette.png'), silhouette);
  writeFileSync(join(absDir, 'reference_front.png'), input.source);
  const palette = extractPaletteJson(input.source, input.visualDNA.palette.global);
  writeFileSync(join(absDir, 'palette.json'), JSON.stringify(palette, null, 2));
  const pack: CharacterIdentityPack = {
    id: input.characterId,
    role: input.role,
    silhouette: input.characterDna?.silhouette ?? input.visualDNA.characters.silhouette,
    bodyProportions: input.characterDna?.bodyProportions ?? input.visualDNA.characters.proportions,
    clothing: input.characterDna?.clothing ?? input.visualDNA.characters.clothing,
    hair: input.characterDna?.faceHair ?? input.visualDNA.characters.hair,
    weapon: input.characterDna?.weapon ?? input.visualDNA.characters.weapon,
    primaryColors: palette.hex.slice(0, 3),
    accentColors: palette.hex.slice(3, 6),
    distinctiveFeatures: input.visualDNA.characters.distinctiveFeatures,
    animationTier: input.animationTier,
    styleFingerprint: input.visualDNA.styleFingerprint,
    sourcePath: `${relDir}/source.png`,
    referenceFrontPath: `${relDir}/reference_front.png`,
    silhouettePath: `${relDir}/silhouette.png`,
    posePaths: input.posePaths ?? {},
  };
  writeFileSync(join(absDir, 'identity.json'), JSON.stringify(pack, null, 2));
  return pack;
}
