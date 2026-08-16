import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateId } from '@metroforge/shared';

const CHECKPOINT_DIR = '.metroforge/checkpoints';

const SNAPSHOT_FILES = [
  'world_graph.json',
  'progression_graph.json',
  'progression_proof.json',
  'game_dna.json',
  'design_bible.json',
  'style_bible.json',
  'generation_manifest.json',
];

export interface ProjectCheckpoint {
  id: string;
  label: string;
  timestamp: string;
  files: string[];
}

export function createProjectCheckpoint(
  projectPath: string,
  label: string,
): ProjectCheckpoint {
  const id = generateId('chk');
  const dest = join(projectPath, CHECKPOINT_DIR, id);
  mkdirSync(dest, { recursive: true });

  const copied: string[] = [];
  for (const file of SNAPSHOT_FILES) {
    const src = join(projectPath, file);
    if (!existsSync(src)) continue;
    copyFileSync(src, join(dest, file));
    copied.push(file);
  }

  const roomsSrc = join(projectPath, 'data', 'rooms', 'rooms.json');
  if (existsSync(roomsSrc)) {
    mkdirSync(join(dest, 'data', 'rooms'), { recursive: true });
    copyFileSync(roomsSrc, join(dest, 'data', 'rooms', 'rooms.json'));
    copied.push('data/rooms/rooms.json');
  }

  const meta: ProjectCheckpoint = {
    id,
    label,
    timestamp: new Date().toISOString(),
    files: copied,
  };
  writeFileSync(join(dest, 'checkpoint.json'), JSON.stringify(meta, null, 2));
  return meta;
}

export function listProjectCheckpoints(projectPath: string): ProjectCheckpoint[] {
  const root = join(projectPath, CHECKPOINT_DIR);
  if (!existsSync(root)) return [];
  const results: ProjectCheckpoint[] = [];
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const metaPath = join(root, dir.name, 'checkpoint.json');
    if (!existsSync(metaPath)) continue;
    try {
      results.push(JSON.parse(readFileSync(metaPath, 'utf-8')) as ProjectCheckpoint);
    } catch {
      /* skip corrupt */
    }
  }
  return results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function restoreProjectCheckpoint(
  projectPath: string,
  checkpointId: string,
): { success: boolean; error?: string } {
  const src = join(projectPath, CHECKPOINT_DIR, checkpointId);
  if (!existsSync(src)) return { success: false, error: 'Checkpoint not found' };

  let meta: ProjectCheckpoint;
  try {
    meta = JSON.parse(readFileSync(join(src, 'checkpoint.json'), 'utf-8')) as ProjectCheckpoint;
  } catch {
    return { success: false, error: 'Invalid checkpoint metadata' };
  }

  for (const rel of meta.files) {
    const from = join(src, rel);
    const to = join(projectPath, rel);
    if (!existsSync(from)) continue;
    mkdirSync(join(projectPath, ...rel.split('/').slice(0, -1)), { recursive: true });
    copyFileSync(from, to);
  }

  return { success: true };
}

export function deleteProjectCheckpoint(projectPath: string, checkpointId: string): boolean {
  const target = join(projectPath, CHECKPOINT_DIR, checkpointId);
  if (!existsSync(target)) return false;
  rmSync(target, { recursive: true, force: true });
  return true;
}
