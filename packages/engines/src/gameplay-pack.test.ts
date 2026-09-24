import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { GameDNA, ProgressionGraph, WorldGraph } from '@metroforge/schemas';
import { buildGameplayPack } from './gameplay-pack.js';

const dna: GameDNA = {
  version: '0.1.0',
  archetype: 'SIDE_VIEW_METROIDVANIA',
  identity: { title: 'Pack Slice', genre: 'Metroidvania', tone: 'dark', visualStyle: 'pixel art' },
  technical: { resolution: { width: 1920, height: 1080 }, tileSize: 16, targetPlaytimeHours: 1, difficulty: 'normal' },
  combat: { style: 'melee', meleeEnabled: true, rangedEnabled: false },
  movement: { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 },
  abilities: [{ id: 'dash', name: 'Dash', category: 'movement', enabled: true }],
  world: { biomeCount: 1, roomCount: 3 },
  narrative: { premise: 'Test', protagonist: 'Courier', centralConflict: 'Pour' },
  seed: 3,
  profile: 'TINY_TEST',
};

describe('buildGameplayPack', () => {
  it('emits shared rooms with pickup, gate, enemy, and victory', () => {
    const roomIds = ['room_000', 'room_001', 'room_002'];
    const pack = buildGameplayPack({
      outputDir: '/tmp/does-not-need-to-exist',
      gameDna: dna,
      worldGraph: {
        version: '0.1.0',
        seed: 3,
        nodes: [
          { id: 'room_000', type: 'room', label: 'Start', metadata: { grantsAbilities: ['dash', 'item_reactor_key'] } },
          { id: 'room_001', type: 'room', label: 'Gate', metadata: {} },
          { id: 'room_002', type: 'room', label: 'End', metadata: { archetype: 'save' } },
        ],
        edges: [
          { id: 'e1', from: 'room_000', to: 'room_001', requirements: ['dash'], optional: false, bidirectional: true },
          { id: 'e2', from: 'room_001', to: 'room_002', requirements: [], optional: false, bidirectional: true },
        ],
        regions: [{ id: 'region_0', name: 'R0', biomeId: 'biome_0', roomIds }],
      } satisfies WorldGraph,
      progressionGraph: {
        version: '0.1.0',
        seed: 3,
        startNodeId: 'room_000',
        endNodeId: 'room_002',
        nodes: [],
        edges: [],
        abilities: ['dash'],
        criticalPath: roomIds,
      } satisfies ProgressionGraph,
      roomIds,
    });
    expect(pack.rooms).toHaveLength(3);
    expect(pack.startRoomId).toBe('room_000');
    expect(pack.rooms[0]?.abilityPickup?.id).toBe('dash');
    expect(pack.rooms[0]?.abilityPickups?.map(pickup => pickup.id)).toEqual(['dash', 'item_reactor_key']);
    expect(pack.rooms[0]?.abilityPickups?.[1]?.x).toBeGreaterThan(pack.rooms[0]?.abilityPickups?.[0]?.x ?? 0);
    expect(pack.rooms.some((room) => room.gates.length > 0)).toBe(true);
    expect(pack.rooms.some((room) => room.enemy?.id)).toBe(true);
    expect(pack.rooms.some((room) => room.checkpoint)).toBe(true);
    expect(pack.rooms.some((room) => room.victory)).toBe(true);
    expect(pack.rooms[0]?.solids.length).toBeGreaterThan(0);
  });
});

// Inspect the exported pack, not just a layout helper: sidecar dimensions must survive assembly.
describe('authored animation layouts', () => {
  function packWithSheet(spec: Record<string, unknown>, width = 1024, height = 768, clip = 'walk', supplied = false) {
    const outputDir = mkdtempSync(join(tmpdir(), 'metroforge-grid-'));
    mkdirSync(join(outputDir, 'assets/characters'), { recursive: true });
    if (!supplied) writeFileSync(join(outputDir, 'assets/characters/player_animations.json'), JSON.stringify({ [clip]: spec }));
    const png = Buffer.alloc(24);
    png.set([0x89, 0x50, 0x4e, 0x47]);
    png.writeUInt32BE(width, 16); png.writeUInt32BE(height, 20);
    return buildGameplayPack({ outputDir, gameDna: dna,
      worldGraph: { version: '0.1.0', seed: 3, nodes: [], edges: [], regions: [] },
      progressionGraph: { version: '0.1.0', seed: 3, startNodeId: 'room_000', endNodeId: 'room_000', nodes: [], edges: [], abilities: [], criticalPath: [] },
      roomIds: [], textureFiles: new Map([[`assets/characters/player_${clip}.png`, png], ...(supplied ? [["assets/characters/player_animations.json", Buffer.from(JSON.stringify({ [clip]: spec }))] as [string, Buffer]] : [])]),
    }).sprites.find(sprite => sprite.clip === clip);
  }
  it.each(['wall_slide', 'wall_jump', 'swim'])('exports traversal clip %s with authored layout and timing', clip => {
    expect(packWithSheet({ frameCount: 8, frameWidth: 256, frameHeight: 384, fps: 12, loop: false }, 1024, 768, clip))
      .toMatchObject({ ownerId: 'player', clip, relativePath: `assets/characters/player_${clip}.png`, frameCount: 8, frameWidth: 256, frameHeight: 384, fps: 12, loop: false });
  });
  it('preserves painted scale, anchor and filtering', () => {
    expect(packWithSheet({frameCount:40,frameWidth:256,frameHeight:384,fps:32,pixelsPerUnit:7,pivotX:120/256,pivotY:20/384,smoothFiltering:true},2048,1920,'walk',true))
      .toMatchObject({pixelsPerUnit:7,pivotX:120/256,pivotY:20/384,smoothFiltering:true});
  });
  it.each([{pixelsPerUnit:0},{pixelsPerUnit:-1},{pivotX:2},{pivotY:-0.1},{smoothFiltering:'yes'}])('rejects invalid presentation settings %j', settings => {
    expect(()=>packWithSheet({frameCount:8,...settings})).toThrow('Invalid animation');
  });
  it('reads supplied settings before a fresh export has written the sidecar', () => {
    expect(packWithSheet({ frameCount: 40, frameWidth: 256, frameHeight: 384, fps: 32, loop: true }, 2048, 1920, 'walk', true))
      .toMatchObject({ frameCount: 40, frameWidth: 256, frameHeight: 384, fps: 32, loop: true });
  });
  it('preserves two-row frame dimensions and slow authored timing', () => {
    expect(packWithSheet({ frameCount: 8, frameWidth: 256, frameHeight: 384, fps: .5, loop: false }))
      .toMatchObject({ frameCount: 8, frameWidth: 256, frameHeight: 384, fps: .5, loop: false });
  });
  it('keeps legacy horizontal strips without explicit dimensions', () => {
    expect(packWithSheet({ frameCount: 8, fps: 10 }, 2048, 384))
      .toMatchObject({ frameWidth: 256, frameHeight: 384, frameCount: 8 });
  });
  it.each([
    { frameCount: 9, frameWidth: 256, frameHeight: 384 },
    { frameCount: 8, frameWidth: 0, frameHeight: 384 },
    { frameCount: 8, frameWidth: 256, frameHeight: -1 },
  ])('rejects invalid authored geometry: %j', spec => {
    expect(() => packWithSheet(spec)).toThrow('Invalid animation frame layout');
  });
});
