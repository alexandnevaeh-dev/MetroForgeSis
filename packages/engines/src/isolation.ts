import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { TargetEngine } from '@metroforge/shared';
import { detectProjectEngine } from './detect.js';

export class EngineOutputCollisionError extends Error {
  readonly code = 'ENGINE_OUTPUT_COLLISION';
  constructor(
    readonly outputPath: string,
    readonly requested: TargetEngine,
    readonly existing: TargetEngine,
  ) {
    super(
      `Refusing to generate ${requested} into ${outputPath} because it already contains a ${existing} project. Use a distinct slug (Godot keeps the base slug; Unity/Unreal append -<engine>).`,
    );
    this.name = 'EngineOutputCollisionError';
  }
}

export function assertEngineOutputIsolation(outputPath: string, engine: TargetEngine): void {
  if (!existsSync(outputPath)) return;
  const existing = detectProjectEngine(outputPath);
  if (existing && existing !== engine) {
    throw new EngineOutputCollisionError(outputPath, engine, existing);
  }
  if (engine !== 'godot' && existsSync(join(outputPath, 'project.godot'))) {
    throw new EngineOutputCollisionError(outputPath, engine, 'godot');
  }
  if (
    engine !== 'unity' &&
    existsSync(join(outputPath, 'ProjectSettings', 'ProjectVersion.txt'))
  ) {
    throw new EngineOutputCollisionError(outputPath, engine, 'unity');
  }
  if (engine !== 'unreal') {
    try {
      if (readdirSync(outputPath).some((name) => name.endsWith('.uproject'))) {
        throw new EngineOutputCollisionError(outputPath, engine, 'unreal');
      }
    } catch (err) {
      if (err instanceof EngineOutputCollisionError) throw err;
    }
  }
}
