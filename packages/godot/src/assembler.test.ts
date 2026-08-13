import { describe, it, expect } from 'vitest';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GodotProjectAssembler } from '../src/assembler.js';
import type { GameDNA, ProgressionGraph, WorldGraph } from '@metroforge/schemas';

const minimalDna: GameDNA = {
  version: '0.1.0',
  archetype: 'SIDE_VIEW_METROIDVANIA',
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
      gameContent: {
        enemies: [],
        bosses: [],
        quests: [],
        items: [],
        npcs: [{ id: 'npc_000', name: 'Test NPC', role: 'lore', roomId: 'room_001', dialogueIds: [], questIds: [] }],
        dialogues: [],
        shops: [],
      },
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

    const room1 = readFileSync(join(outputDir, 'scenes', 'rooms', 'room_001.tscn'), 'utf-8');
    expect(room1).toContain('instance=ExtResource("9_npc")');
    expect(room1).toContain('npc_id = "npc_000"');
    expect(room1).toContain('npc_name = "Test NPC"');
    expect(room1).toContain('sheet_path = "assets/npcs/npc_000_walk.png"');
    expect(readFileSync(join(outputDir, 'scenes', 'world', 'NPC.tscn'), 'utf-8')).toContain(
      'AnimatedSprite2D',
    );

    const roomsData = JSON.parse(readFileSync(join(outputDir, 'data', 'rooms', 'rooms.json'), 'utf-8'));
    expect(roomsData.rooms.room_001.archetype).toBe('npc');

    const npcsData = JSON.parse(readFileSync(join(outputDir, 'data', 'npcs', 'npcs.json'), 'utf-8'));
    expect(npcsData.npcs).toHaveLength(1);
    expect(npcsData.npcs[0].id).toBe('npc_000');

    const dialoguesData = JSON.parse(
      readFileSync(join(outputDir, 'data', 'dialogues', 'dialogues.json'), 'utf-8'),
    );
    expect(Array.isArray(dialoguesData.dialogues)).toBe(true);
    const shopsData = JSON.parse(readFileSync(join(outputDir, 'data', 'shops', 'shops.json'), 'utf-8'));
    expect(Array.isArray(shopsData.shops)).toBe(true);

    const playtestRoute = JSON.parse(readFileSync(join(outputDir, 'playtest_route.json'), 'utf-8'));
    expect(playtestRoute.reachable).toBe(true);
    expect(playtestRoute.transitions.length).toBeGreaterThan(0);
    expect(playtestRoute.persona?.id).toBe('victory_rusher');

    const movementJson = JSON.parse(
      readFileSync(join(outputDir, 'data', 'player', 'movement.json'), 'utf-8'),
    );
    expect(movementJson.grappleSpeed).toBe(620);
    expect(movementJson.swimSpeed).toBe(180);
    expect(movementJson.phaseDuration).toBe(0.22);
    expect(movementJson.dashSpeed).toBe(500);

    rmSync(outputDir, { recursive: true, force: true });
  });
});
