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
  it('exports every authored guardian with its phases and boss animation sheets', () => {
    const roomIds = ['room_000', 'room_001', 'room_002'];
    const png = Buffer.alloc(24); png.set([0x89, 0x50, 0x4e, 0x47]); png.writeUInt32BE(512, 16); png.writeUInt32BE(64, 20);
    const textures = new Map<string, Buffer>();
    for (const id of ['boss_000', 'boss_final']) {
      for (const action of ['idle', 'walk', 'run', 'telegraph', 'attack', 'attack_projectile', 'attack_burst', 'recovery', 'hurt', 'death'])
        textures.set(`assets/bosses/${id}_${action}.png`, png);
      textures.set(`assets/bosses/${id}_animations.json`, Buffer.from(JSON.stringify({ run: { frameCount: 8, fps: 12, loop: true } })));
    }
    const boss = (id: string, arenaRoomId: string) => ({ id, arenaRoomId, name: id, lore: 'Guardian', health: 200,
      phases: [{ phase: 1, healthThreshold: 1, attacks: ['slam'], telegraphDuration: 0.8, recoveryWindow: 1.2 },
        { phase: 2, healthThreshold: 0.5, attacks: ['projectile', 'area_burst'], telegraphDuration: 0.6, recoveryWindow: 0.8 }],
      weaknesses: [], visualPrompt: 'Stormglass guardian' });
    const pack = buildGameplayPack({ outputDir: join(tmpdir(), 'boss-path-fixture'), gameDna: dna, roomIds, textureFiles: textures,
      gameContent: { enemies: [], bosses: [boss('boss_000', 'room_001'), boss('boss_final', 'room_002')], quests: [], items: [], npcs: [], dialogues: [], shops: [] },
      worldGraph: { version: '0.1.0', seed: 3, nodes: roomIds.map((id) => ({ id, type: 'room' as const, label: id, metadata: {} })), edges: [], regions: [] },
      progressionGraph: { version: '0.1.0', seed: 3, startNodeId: 'room_000', endNodeId: 'room_002', nodes: [], edges: [], abilities: [], criticalPath: roomIds },
    });
    expect(pack.rooms[1]?.enemy).toMatchObject({ id: 'boss_000', isBoss: true, health: 200 });
    expect(pack.rooms[2]?.enemy?.bossPhases).toHaveLength(2);
    expect(pack.rooms[2]?.victory).toBe(true);
    expect(pack.sprites.filter((clip) => clip.ownerId === 'boss_final')).toHaveLength(10);
    expect(pack.sprites.find((clip) => clip.ownerId === 'boss_final' && clip.clip === 'run')).toMatchObject({ fps: 12, frameCount: 8 });
    expect(pack.sprites.filter((clip) => clip.ownerId.startsWith('boss_')).every((clip) => clip.relativePath.startsWith('assets/bosses/'))).toBe(true);
  });
  it('carries one authored castle interior through all 40 rooms with four condition tints', () => {
    const roomIds = Array.from({ length: 40 }, (_, index) => `room_${String(index).padStart(3, '0')}`);
    const interior = 'assets/backgrounds/stormglass/reliquary_interior.png';
    const pack = buildGameplayPack({ outputDir: join(tmpdir(), 'no-interior-file-required'), gameDna: dna, roomIds,
      textureFiles: new Map([[interior, Buffer.from('path-presence fixture')]]),
      worldGraph: { version: '0.1.0', seed: 3, nodes: roomIds.map((id) => ({ id, type: 'room' as const, label: id, metadata: { archetype: 'tutorial' } })),
        edges: [], regions: [{ id: 'region_0', name: 'Castle', biomeId: 'biome_0', roomIds }] },
      progressionGraph: { version: '0.1.0', seed: 3, startNodeId: roomIds[0]!, endNodeId: roomIds[39]!,
        nodes: [], edges: [], abilities: [], criticalPath: roomIds },
    });
    expect(pack.rooms.every((room) => room.backgrounds.interior === interior)).toBe(true);
    expect(new Set(pack.rooms.map((room) => JSON.stringify(room.backgrounds.interiorTint))).size).toBe(4);
    expect(pack.rooms[0]?.backgrounds.interiorTint).toEqual(pack.rooms[9]?.backgrounds.interiorTint);
    expect(pack.rooms[0]?.backgrounds.interiorTint).not.toEqual(pack.rooms[10]?.backgrounds.interiorTint);
  });
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
  it('exports an authored strike pose with its attack clip', () => {
    expect(packWithSheet({ frameCount: 8, fps: 11, impactFrame: 5 }, 512, 64, 'attack', true))
      .toMatchObject({ frameCount: 8, fps: 11, impactFrame: 5 });
  });
  it.each([-1, 8, 2.5, '4'])('rejects an invalid strike pose %j', impactFrame => {
    expect(() => packWithSheet({ frameCount: 8, fps: 11, impactFrame }, 512, 64, 'attack', true))
      .toThrow('Invalid animation impact frame');
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

it.each([['checkpoint', 'save_shrine'], ['victory', 'victory']])('exports authored %s art without changing gameplay geometry', (owner, asset) => {
  const outputDir = mkdtempSync(join(tmpdir(), 'metroforge-checkpoint-'));
  const input = {
    outputDir, gameDna: dna,
    worldGraph: { version: '0.1.0' as const, seed: 3, nodes: [{ id: 'room_000', type: 'room' as const, label: 'Shrine', metadata: { archetype: 'save' } }], edges: [], regions: [] },
    progressionGraph: { version: '0.1.0' as const, seed: 3, startNodeId: 'room_000', endNodeId: 'room_000', nodes: [], edges: [], abilities: [], criticalPath: ['room_000'] },
    roomIds: ['room_000'],
  };
  const baseline = buildGameplayPack(input);
  const png = Buffer.alloc(24);
  png.set([0x89, 0x50, 0x4e, 0x47]);
  png.writeUInt32BE(768, 16); png.writeUInt32BE(1024, 20);
  const idle = { frameCount: 1, frameWidth: 768, frameHeight: 1024, fps: 1, loop: false, pixelsPerUnit: 10.625, pivotX: 384.5 / 768, pivotY: 181 / 1024, smoothFiltering: true };
  const pack = buildGameplayPack({ ...input, textureFiles: new Map([
    [`assets/props/interact/${asset}.png`, png],
    [`assets/props/interact/${asset}_animations.json`, Buffer.from(JSON.stringify({ idle }))],
  ]) });
  expect(pack.sprites.find(sprite => sprite.ownerId === owner && sprite.clip === 'idle'))
    .toMatchObject({ ...idle, relativePath: `assets/props/interact/${asset}.png` });
  expect(pack.rooms[0]?.checkpoint).toBeDefined();
  expect(pack.rooms).toEqual(baseline.rooms);
  expect(baseline.sprites.some(sprite => sprite.ownerId === owner)).toBe(false);
});

it('checks terrain edits against the image before exporting gameplay', () => {
  const png = Buffer.alloc(24); png.set([0x89,0x50,0x4e,0x47]); png.writeUInt32BE(64,16); png.writeUInt32BE(64,20);
  const textures = new Map<string, Buffer>();
  const input = {
    outputDir: mkdtempSync(join(tmpdir(),'terrain-export-')), gameDna:dna,
    worldGraph:{version:'0.1.0' as const,seed:3,nodes:[],edges:[],regions:[]},
    progressionGraph:{version:'0.1.0' as const,seed:3,startNodeId:'room_000',endNodeId:'room_000',nodes:[],edges:[],abilities:[],criticalPath:[]},
    roomIds:[],textureFiles:textures,
  };
  const settings='assets/tilesets/biome_0/floor.presentation.json';
  textures.set(settings,Buffer.from(JSON.stringify({width:64,height:64})));
  expect(()=>buildGameplayPack(input)).toThrow('Terrain image is missing');
  textures.set('assets/tilesets/biome_0/floor.png',png);
  expect(()=>buildGameplayPack(input)).not.toThrow();
  textures.set(settings,Buffer.from(JSON.stringify({width:65,height:64})));
  expect(()=>buildGameplayPack(input)).toThrow('Terrain crop or scale');
  textures.set(settings,Buffer.from(JSON.stringify({width:64,height:64,tintR:2})));
  expect(()=>buildGameplayPack(input)).toThrow('Terrain tint');
});
