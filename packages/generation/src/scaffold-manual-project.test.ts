import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffoldManualProject } from './scaffold-manual-project.js';

describe('manual project genre isolation', () => {
  it.each(['TOP_DOWN_ACTION_ADVENTURE', 'SIDE_VIEW_METROIDVANIA', 'SIDE_VIEW_PLATFORMER'] as const)(
    'keeps %s graph and route in its own level set',
    (archetype: 'TOP_DOWN_ACTION_ADVENTURE' | 'SIDE_VIEW_METROIDVANIA' | 'SIDE_VIEW_PLATFORMER') => {
      const outputDir = mkdtempSync(join(tmpdir(), 'metroforge-genre-'));
      try {
        const result = scaffoldManualProject({
          outputDir,
          title: 'Genre test',
          slug: 'genre-test',
          archetype,
          profile: 'TINY_TEST',
          seed: 42,
        });
        expect(result.success, result.errors.join(';')).toBe(true);
        const graph = JSON.parse(readFileSync(join(outputDir, 'world_graph.json'), 'utf8'));
        const route = readFileSync(join(outputDir, 'playtest_route.json'), 'utf8');
        const ids = graph.nodes.map((node: { id: string }) => node.id);
        if (archetype === 'TOP_DOWN_ACTION_ADVENTURE') {
          expect(ids).toContain('overworld');
          expect(ids).toContain('dungeon_000_r3');
          expect(ids.some((id: string) => /^room_/.test(id))).toBe(false);
          expect(route).not.toMatch(/"room_\d+"/);
        } else {
          expect(ids).toContain('room_000');
          expect(ids).not.toContain('overworld');
          expect(route).not.toContain('dungeon_000');
          if(archetype === 'SIDE_VIEW_PLATFORMER'){
            const music=readFileSync(join(outputDir,'audio/music/biome_0.wav'));
            expect(music.subarray(0,4).toString()).toBe('RIFF');
            expect(music.length).toBeGreaterThan(44000);
            expect(readFileSync(join(outputDir,'scenes/rooms/room_000.tscn'),'utf8')).toContain('one_way_collision = true');
          }
        }
      } finally {
        rmSync(outputDir, { recursive: true, force: true });
      }
    },
  );
});
