export interface SpriteSizeClass {
  id: 'player' | 'standard_enemy' | 'elite_enemy' | 'boss' | 'environment_module';
  minPx: number;
  maxPx: number;
  gridMultiple?: number;
}

export const SPRITE_SIZE_CLASSES: SpriteSizeClass[] = [
  { id: 'player', minPx: 32, maxPx: 96 },
  { id: 'standard_enemy', minPx: 24, maxPx: 80 },
  { id: 'elite_enemy', minPx: 40, maxPx: 128 },
  { id: 'boss', minPx: 64, maxPx: 256 },
  { id: 'environment_module', minPx: 16, maxPx: 64, gridMultiple: 16 },
];

export interface NormalizationViolation {
  path: string;
  reason: string;
}

export function classifySpriteKind(relPath: string): SpriteSizeClass['id'] | null {
  if (relPath.includes('/characters/player') || relPath.endsWith('player.png')) return 'player';
  if (relPath.includes('/bosses/')) return 'boss';
  if (relPath.includes('/enemies/')) return 'standard_enemy';
  if (relPath.includes('/tilesets/')) return 'environment_module';
  return null;
}

export function evaluateSpriteDimensions(
  relPath: string,
  width: number,
  height: number,
): NormalizationViolation | null {
  const kind = classifySpriteKind(relPath);
  if (!kind) return null;
  const spec = SPRITE_SIZE_CLASSES.find((s) => s.id === kind)!;
  const maxDim = Math.max(width, height);
  if (maxDim < spec.minPx) {
    return { path: relPath, reason: `${kind} sprite ${width}x${height} below min ${spec.minPx}` };
  }
  if (kind === 'environment_module' && spec.gridMultiple && width % spec.gridMultiple !== 0) {
    return { path: relPath, reason: `tileset width ${width} is not a ${spec.gridMultiple}px multiple` };
  }
  return null;
}

export function expectedGridSize(tileSize: number): { module: number; atlasCols: number; atlasRows: number } {
  return { module: tileSize, atlasCols: 8, atlasRows: 6 };
}
