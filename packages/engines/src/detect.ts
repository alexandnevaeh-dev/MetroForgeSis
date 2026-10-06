import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TargetEngine } from '@metroforge/shared';

export function detectProjectEngine(projectPath: string): TargetEngine | null {
  const manifestPath = join(projectPath, 'engine.json');
  if (existsSync(manifestPath)) {
    try {
      const parsed = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { engine?: string };
      if (parsed.engine === 'godot' || parsed.engine === 'unity' || parsed.engine === 'unreal') {
        return parsed.engine;
      }
    } catch {
      // fall through to fingerprints
    }
  }
  if (existsSync(join(projectPath, 'project.godot'))) return 'godot';
  if (existsSync(join(projectPath, 'ProjectSettings', 'ProjectVersion.txt'))) return 'unity';
  try {
    if (readdirSync(projectPath).some((name) => name.endsWith('.uproject'))) return 'unreal';
  } catch {
    return null;
  }
  return null;
}
