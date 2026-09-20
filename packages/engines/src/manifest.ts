import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENGINE_VERSIONS, type TargetEngine } from '@metroforge/shared';
import type { EngineManifest } from './types.js';

export function writeEngineManifest(
  outputDir: string,
  engine: TargetEngine,
  extras: Partial<EngineManifest> = {},
): EngineManifest {
  const manifest: EngineManifest = {
    engine,
    engineVersion: extras.engineVersion ?? ENGINE_VERSIONS[engine],
    generated: true,
    compiled: extras.compiled ?? false,
    opened: extras.opened ?? false,
    playtested: extras.playtested ?? false,
    visualCapture: extras.visualCapture ?? false,
    standaloneBuild: extras.standaloneBuild ?? false,
    acceptance: extras.acceptance ?? 'open',
    blocked: extras.blocked ?? [],
    gameplayPack: extras.gameplayPack ?? (engine === 'godot' ? 'data/rooms/rooms.json' : 'gameplay.json'),
    notes: [
      'generated, compiled, opened, and playtested are distinct statuses',
      ...(extras.notes ?? [`${engine} project assembled from shared gameplay data`]),
    ],
  };
  writeFileSync(join(outputDir, 'engine.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}
