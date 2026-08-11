import { describe, it, expect } from 'vitest';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GodotProjectAssembler } from '../src/assembler.js';
import type { GameDNA, ProgressionGraph, WorldGraph } from '@metroforge/schemas';

const minimalDna: GameDNA = {
  version: '0.1.0',
  identity: {
    title: 'Test Game',
    genre: 'Metroidvania',
    tone: 'dark',
    visualStyle: 'pixel art',
  },
  technical: {
    resolution: { width: 1280, height: 720 },
    tileSize: 16,
    targetPlaytimeHours: 2,
    difficulty: 'normal',
  },
  combat: { style: 'melee', meleeEnabled: true, rangedEnabled: false },
  movement: { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 },
  abilities: [{ id: 'dash', name: 'Dash', category: 'movement', enabled: true }],
  world: { biomeCount: 1, roomCount: 3 },
  narrative: {
    premise: 'Test',
    protagonist: 'Hero',
    centralConflict: 'Conflict',
  },
  seed: 1,
  profile: 'TINY_TEST',
};

describe('GodotProjectAssembler', () => {
  it('generates room scenes with transitions and asset paths', () => {
    const outputDir = join(tmpdir(), `metroforge-assembler-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });

    const roomIds = ['room_000', 'room_001', 'room_002'];
    const worldGraph: WorldGraph = {
      version: '0.1.0',
      seed: 1,
      nodes: roomIds.map((id) => ({ id, type: 'room' as const, label: id, metadata: {} })),
      edges: [
        {
          id: 'e1',
          from: 'room_000',
          to: 'room_001',
          requirements: [],
          optional: false,
          bidirectional: true,
        },
        {
          id: 'e2',
          from: 'room_001',
          to: 'room_002',
          requirements: [],
          optional: false,
          bidirectional: true,
        },
      ],
      regions: [{ id: 'region_0', name: 'R0', biomeId: 'biome_0', roomIds }],
    };

    const progressionGraph: ProgressionGraph = {
      version: '0.1.0',
      seed: 1,
      startNodeId: 'room_000',
      endNodeId: 'room_002',
      nodes: [],
      edges: [],
      abilities: ['dash'],
      criticalPath: roomIds,
    };

    const assembler = new GodotProjectAssembler();
    const result = assembler.assemble({
      outputDir,
      gameDna: minimalDna,
      worldGraph,
      progressionGraph,
      roomIds,
      textureFiles: new Map([
        ['assets/characters/player.png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
        ['assets/tilesets/biome_0/source.png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
      ]),
    });

    expect(result.success).toBe(true);

    const room0 = readFileSync(join(outputDir, 'scenes', 'rooms', 'room_000.tscn'), 'utf-8');
    expect(room0).toContain('RoomTransition');
    expect(room0).toContain('target_room_id = "room_001"');
    expect(room0).toContain('TextureRect');
    expect(existsSync(join(outputDir, 'assets_manifest.json'))).toBe(true);

    rmSync(outputDir, { recursive: true, force: true });
  });
});
