import { createHash } from 'node:crypto';
import { VISUAL_DNA_VERSION, type VisualDNA } from '@metroforge/schemas';

export function hashVisualFragment(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export function computeStyleFingerprint(input: {
  palette: string[];
  renderingStyle: string;
  tileSize: number;
  spriteScale: number;
  materials: string[];
  lighting: string;
  architecture: string;
  artStyleId: string;
  version?: number;
}): string {
  const payload = [
    `v${input.version ?? VISUAL_DNA_VERSION}`,
    input.artStyleId,
    input.renderingStyle,
    `tile:${input.tileSize}`,
    `scale:${input.spriteScale}`,
    input.palette.join(','),
    input.materials.join('|'),
    input.lighting,
    input.architecture,
  ].join('\n');
  return hashVisualFragment(payload);
}

export function fingerprintFromVisualDNA(dna: Pick<VisualDNA, 'artStyle' | 'renderingStyle' | 'resolution' | 'palette' | 'materials' | 'lighting' | 'architecture' | 'version'>): string {
  return computeStyleFingerprint({
    palette: dna.palette.global,
    renderingStyle: dna.renderingStyle,
    tileSize: dna.resolution.tileSize,
    spriteScale: dna.resolution.spriteScale,
    materials: dna.materials.map((m) => m.id),
    lighting: `${dna.lighting.key}|${dna.lighting.accent}|${dna.lighting.direction}`,
    architecture: dna.architecture.motifs.join(','),
    artStyleId: dna.artStyle.id,
    version: dna.version,
  });
}
