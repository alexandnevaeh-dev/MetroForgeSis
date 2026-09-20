/** Target runtime for a generated project. Godot remains the default. */
export const TARGET_ENGINES = ['godot', 'unity', 'unreal'] as const;
export type TargetEngine = (typeof TARGET_ENGINES)[number];

export const DEFAULT_TARGET_ENGINE: TargetEngine = 'godot';

export const ENGINE_VERSIONS = {
  godot: '4.7.2',
  unity: '6000.3',
  unreal: '5.8',
} as const;

export function isTargetEngine(value: string | undefined | null): value is TargetEngine {
  return value != null && (TARGET_ENGINES as readonly string[]).includes(value);
}

export function parseTargetEngine(
  value: string | undefined,
): TargetEngine | { error: string } {
  const candidate = (value ?? DEFAULT_TARGET_ENGINE).trim().toLowerCase();
  if (isTargetEngine(candidate)) return candidate;
  return {
    error: `Unknown --engine "${value}". Expected: ${TARGET_ENGINES.join(', ')}`,
  };
}

/**
 * Isolate Unity/Unreal output from Godot. Godot keeps the historical slug so existing
 * `GeneratedGames/<slug>/` paths stay stable. Other engines append `-<engine>` unless the
 * slug already encodes that suffix.
 */
export function engineOutputSlug(baseSlug: string, engine: TargetEngine): string {
  if (engine === 'godot') return baseSlug;
  const suffix = `-${engine}`;
  return baseSlug.endsWith(suffix) ? baseSlug : `${baseSlug}${suffix}`;
}

export function engineFingerprintFiles(engine: TargetEngine): string[] {
  switch (engine) {
    case 'godot':
      return ['project.godot'];
    case 'unity':
      return ['ProjectSettings/ProjectVersion.txt', 'Assets'];
    case 'unreal':
      return ['.uproject'];
  }
}
