export type AssetAnimationMetadata = {
  isAnimation: boolean;
  frameCount?: number;
  frameWidth?: number;
  frameHeight?: number;
  fps?: number;
  loop?: boolean;
  sourceFrames?: string[];
  sourceSheet?: string;
  sourceRegions?: [number, number, number, number][];
  frameFootAnchors?: [number, number][];
  displayScale?: number;
  animationSourceError?: string;
};

const positive = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
const integer = (value: unknown) => {
  const number = positive(value);
  return number !== undefined && Number.isInteger(number) ? number : undefined;
};

function sourceAnimation(entry: Record<string, unknown>): Partial<AssetAnimationMetadata> | undefined {
  const independent = Object.hasOwn(entry, 'sourceFrames');
  if (!independent && !Object.hasOwn(entry, 'sourceSheet')) return undefined;
  const invalid = () => ({ animationSourceError: 'Source-frame metadata is invalid.' });
  const path = (value: unknown): value is string => typeof value === 'string'
    && value.startsWith('assets/') && value.endsWith('.png')
    && !value.includes('\\') && !value.includes(':') && !value.split('/').includes('..');
  const regions = entry.sourceRegions;
  if (!Array.isArray(regions) || regions.length === 0 || regions.length > 256
    || !regions.every(r => Array.isArray(r) && r.length === 4
      && r.every(v => typeof v === 'number' && Number.isFinite(v))
      && r[0] >= 0 && r[1] >= 0 && r[2] > 0 && r[3] > 0)
    || !positive(entry.displayScale)) return invalid();
  if (Object.hasOwn(entry, 'fps') && !positive(entry.fps)) return invalid();
  if (Object.hasOwn(entry, 'loop') && typeof entry.loop !== 'boolean') return invalid();
  if (independent) {
    if (Object.hasOwn(entry, 'sourceSheet') || !Array.isArray(entry.sourceFrames)
      || entry.sourceFrames.length !== regions.length || !entry.sourceFrames.every(path)
      || integer(entry.frameCount) !== regions.length || !Object.hasOwn(entry, 'frameFootAnchors')) return invalid();
  } else if (!path(entry.sourceSheet)) return invalid();
  let anchors = entry.frameFootAnchors;
  if (Object.hasOwn(entry, 'frameFootAnchors')) {
    if (!Array.isArray(anchors) || anchors.length !== regions.length
      || !anchors.every(a => Array.isArray(a) && a.length === 2
        && a.every(v => typeof v === 'number' && Number.isFinite(v)))) return invalid();
  } else {
    if (typeof entry.footAnchorY !== 'number' || !Number.isFinite(entry.footAnchorY) || entry.footAnchorY < 0) return invalid();
    anchors = regions.map(r => [r[2] / 2, entry.footAnchorY]);
  }
  return {
    frameCount: regions.length,
    ...(independent ? { sourceFrames: [...entry.sourceFrames as string[]] } : { sourceSheet: entry.sourceSheet as string }),
    sourceRegions: regions.map(r => [...r] as [number, number, number, number]),
    frameFootAnchors: (anchors as number[][]).map(a => [...a] as [number, number]),
    displayScale: entry.displayScale as number,
    fps: positive(entry.fps),
    loop: typeof entry.loop === 'boolean' ? entry.loop : undefined,
  };
}

export function resolveAssetAnimation(
  path: string,
  metadata: Record<string, unknown>,
  readSidecar: (path: string) => unknown,
): AssetAnimationMetadata {
  const match = path.replace(/\\/g, '/').match(/^(.*?)_(attack_projectile|attack_burst|jump_start|wall_slide|wall_jump|attack_2|attack_3|air_dash|telegraph|recovery|locomotion|idle|walk|run|jump|fall|land|dash|swim|attack|hurt|death|fly|hover|talk|listen)\.png$/i);
  let clip: Record<string, unknown> = {};
  if (match) {
    try {
      const sidecar = readSidecar(match[1] + '_animations.json');
      const value = sidecar && typeof sidecar === 'object'
        ? (sidecar as Record<string, unknown>)[match[2].toLowerCase()] : null;
      if (value && typeof value === 'object') clip = value as Record<string, unknown>;
    } catch { /* Missing sidecar leaves metadata unknown, never guessed. */ }
  }
  const frameCount = integer(metadata.frameCount) ?? integer(clip.frameCount);
  const source = sourceAnimation(Object.hasOwn(clip, 'sourceFrames') || Object.hasOwn(clip, 'sourceSheet') ? clip : metadata);
  return {
    isAnimation: Boolean(source || match || (frameCount && frameCount > 1)),
    frameCount,
    frameWidth: integer(metadata.frameWidth) ?? integer(clip.frameWidth),
    frameHeight: integer(metadata.frameHeight) ?? integer(clip.frameHeight),
    fps: positive(metadata.fps) ?? positive(clip.fps),
    loop: typeof metadata.loop === 'boolean' ? metadata.loop
      : typeof clip.loop === 'boolean' ? clip.loop : undefined,
    ...source,
    ...(source?.animationSourceError ? {frameCount: undefined} : {}),
  };
}
