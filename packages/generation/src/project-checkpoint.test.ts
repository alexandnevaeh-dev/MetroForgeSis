import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createProjectCheckpoint,
  listProjectCheckpoints,
  restoreProjectCheckpoint,
} from './project-checkpoint.js';

describe('project-checkpoint', () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), 'metroforge-chk-'));
    writeFileSync(join(projectPath, 'world_graph.json'), JSON.stringify({ nodes: [], edges: [] }));
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  it('creates and restores checkpoints', () => {
    writeFileSync(join(projectPath, 'world_graph.json'), JSON.stringify({ nodes: [{ id: 'a' }], edges: [] }));
    const checkpoint = createProjectCheckpoint(projectPath, 'before edit');
    expect(checkpoint.id).toBeTruthy();

    writeFileSync(join(projectPath, 'world_graph.json'), JSON.stringify({ nodes: [{ id: 'b' }], edges: [] }));
    const restored = restoreProjectCheckpoint(projectPath, checkpoint.id);
    expect(restored.success).toBe(true);

    const graph = JSON.parse(readFileSync(join(projectPath, 'world_graph.json'), 'utf-8'));
    expect(graph.nodes[0].id).toBe('a');
    expect(listProjectCheckpoints(projectPath).length).toBe(1);
  });
});
