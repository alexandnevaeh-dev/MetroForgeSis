export type AssetAnimationMetadata = {
  isAnimation: boolean;
  frameCount?: number;
  frameWidth?: number;
  frameHeight?: number;
  fps?: number;
  loop?: boolean;
};

const positive = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
const integer = (value: unknown) => {
  const number = positive(value);
  return number !== undefined && Number.isInteger(number) ? number : undefined;
};

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
  return {
    isAnimation: Boolean(match || (frameCount && frameCount > 1)),
    frameCount,
    frameWidth: integer(metadata.frameWidth) ?? integer(clip.frameWidth),
    frameHeight: integer(metadata.frameHeight) ?? integer(clip.frameHeight),
    fps: positive(metadata.fps) ?? positive(clip.fps),
    loop: typeof metadata.loop === 'boolean' ? metadata.loop
      : typeof clip.loop === 'boolean' ? clip.loop : undefined,
  };
}
