import { describe, it, expect } from 'vitest';
import {
  deriveWeakFloors,
  deriveGrapplePoints,
  deriveWaterZones,
  derivePhaseBarriers,
  generateRoomScene,
  resolvePublishedArchetype,
  buildRoomAssemblyOptions,
  buildPublishedRoomRecord,
  prepareRoomAssemblyContext,
  auditRoomArchetypeFidelity,
  pickRoomPickupItem,
} from '../src/room-assembler.js';
import { generateWorldTopology } from '@metroforge/procedural';
import { generateGameContent } from '@metroforge/procedural';
import { GameDNASchema } from '@metroforge/schemas';

describe('resolvePublishedArchetype', () => {
  it('preserves world graph traversal archetype when no special features', () => {
    expect(
      resolvePublishedArchetype({
        isBossRoom: false,
        hasAbilityPickup: false,
        hasSavePoint: false,
        roomNpcs: [],
        hasItemPickup: false,
        worldGraphArchetype: 'traversal',
      }),
    ).toBe('traversal');
  });

  it('boss room overrides world graph archetype', () => {
    expect(
      resolvePublishedArchetype({
        isBossRoom: true,
        hasAbilityPickup: false,
        hasSavePoint: false,
        roomNpcs: [],
        hasItemPickup: false,
        worldGraphArchetype: 'traversal',
      }),
    ).toBe('boss');
  });

  it('merchant NPC room uses shop archetype', () => {
    expect(
      resolvePublishedArchetype({
        isBossRoom: false,
        hasAbilityPickup: false,
        hasSavePoint: false,
        roomNpcs: [{ role: 'merchant' }],
        hasItemPickup: false,
      }),
    ).toBe('shop');
  });
});

describe('deriveWeakFloors', () => {
  it('places a weak floor for ground_slam down gates', () => {
    const floors = deriveWeakFloors(
      [
        {
          direction: 'down',
          targetRoomId: 'room_002',
          requirements: ['ground_slam'],
        },
      ],
      800,
    );
    expect(floors).toHaveLength(1);
    expect(floors[0]).toMatchObject({ x: 400, width: 128, targetRoomId: 'room_002' });
  });

  it('ignores non ground_slam down connections', () => {
    expect(
      deriveWeakFloors(
        [{ direction: 'down', targetRoomId: 'room_002', requirements: ['dash'] }],
        800,
      ),
    ).toHaveLength(0);
  });
});

describe('deriveGrapplePoints', () => {
  it('places a grapple anchor for grapple-gated connections', () => {
    const points = deriveGrapplePoints(
      [{ direction: 'up', targetRoomId: 'room_002', requirements: ['grapple'] }],
      800,
      536,
    );
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ targetRoomId: 'room_002', y: 356 });
  });
});

describe('deriveWaterZones', () => {
  it('places a swim zone for swim-gated connections', () => {
    const zones = deriveWaterZones(
      [{ direction: 'down', targetRoomId: 'room_003', requirements: ['swim'] }],
      800,
      536,
    );
    expect(zones).toHaveLength(1);
    expect(zones[0]?.targetRoomId).toBe('room_003');
  });
});

describe('derivePhaseBarriers', () => {
  it('places a phase barrier for phase-gated connections', () => {
    const barriers = derivePhaseBarriers(
      [{ direction: 'right', targetRoomId: 'room_004', requirements: ['phase'] }],
      800,
      536,
    );
    expect(barriers).toHaveLength(1);
    expect(barriers[0]?.targetRoomId).toBe('room_004');
  });
});

describe('buildRoomAssemblyOptions archetypes', () => {
  it('spawns enemies in arena rooms and skips them in puzzle rooms', () => {
    const ctx = {
      roomIds: ['room_000', 'room_001'],
      roomConnections: new Map([
        ['room_000', []],
        ['room_001', []],
      ]),
      worldGraphNodesById: new Map([
        ['room_001', { id: 'room_001', type: 'room', label: 'Arena', metadata: { archetype: 'arena' } }],
      ]),
      npcsByRoom: new Map(),
      bossesByRoom: new Map(),
    } as import('../src/room-assembler.js').RoomAssemblyContext;
    const gameDna = {
      world: { biomeCount: 1 },
      technical: { tileSize: 16 },
    } as import('@metroforge/schemas').GameDNA;
    const arenaOpts = buildRoomAssemblyOptions(
      'room_001',
      1,
      ctx,
      gameDna,
      undefined,
      { value: 0 },
      () => false,
    );
    ctx.worldGraphNodesById.set('room_001', {
      id: 'room_001',
      type: 'room',
      label: 'Puzzle',
      metadata: { archetype: 'puzzle' },
    });
    const puzzleOpts = buildRoomAssemblyOptions(
      'room_001',
      1,
      ctx,
      gameDna,
      undefined,
      { value: 0 },
      () => false,
    );
    expect(arenaOpts.hasEnemy).toBe(true);
    expect(puzzleOpts.hasEnemy).toBe(false);
  });
});

const mediumDna = GameDNASchema.parse({
  version: '0.1.0',
  identity: {
    title: 'Archetype Test',
    genre: 'Metroidvania',
    tone: 'dark',
    visualStyle: 'pixel',
  },
  technical: {
    resolution: { width: 1920, height: 1080 },
    tileSize: 16,
    targetPlaytimeHours: 4,
    difficulty: 'normal',
  },
  combat: { style: 'melee', meleeEnabled: true, rangedEnabled: false },
  movement: { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 },
  abilities: [
    { id: 'dash', name: 'Dash', category: 'movement', enabled: true },
    { id: 'double_jump', name: 'Double Jump', category: 'movement', enabled: true },
  ],
  world: { biomeCount: 2, roomCount: 20 },
  narrative: { premise: 'Test', protagonist: 'Hero', centralConflict: 'Conflict' },
  seed: 42,
  profile: 'MEDIUM',
});

describe('room archetype fidelity', () => {
  it('preserves world-graph archetypes in rooms.json without combat collapse', () => {
    const abilities = ['dash', 'double_jump', 'wall_slide'];
    const { worldGraph, roomIds } = generateWorldTopology({
      seed: 42,
      roomCount: 20,
      biomeCount: 2,
      abilities,
      bossCount: 2,
      profile: 'MEDIUM',
    });
    const content = generateGameContent(mediumDna, 'MEDIUM', 42, roomIds.at(-1)!, roomIds);
    const ctx = prepareRoomAssemblyContext(worldGraph, content, roomIds);
    const counter = { value: 0 };
    const rooms: Record<string, ReturnType<typeof buildPublishedRoomRecord>> = {};

    for (let i = 0; i < roomIds.length; i++) {
      const roomId = roomIds[i]!;
      const opts = buildRoomAssemblyOptions(roomId, i, ctx, mediumDna, content, counter, () => false);
      rooms[roomId] = buildPublishedRoomRecord(roomId, i, opts);
    }

    const audit = auditRoomArchetypeFidelity(worldGraph, rooms);
    expect(audit.passed).toBe(true);
    expect(audit.issues).toHaveLength(0);
    expect(audit.preserved).toBeGreaterThan(0);

    const connectorRoom = Object.values(rooms).find((r) => r.worldArchetype === 'connector');
    if (connectorRoom) {
      expect(connectorRoom.archetype).toBe('connector');
    }
  });

  it('places non-currency equipment in treasure rooms', () => {
    const roomIds = ['room_000', 'room_005'];
    const content = generateGameContent(mediumDna, 'MEDIUM', 42, 'room_005', roomIds);
    const ctx = {
      roomIds,
      roomConnections: new Map(),
      worldGraphNodesById: new Map([
        [
          'room_005',
          {
            id: 'room_005',
            type: 'room' as const,
            label: 'Treasure',
            metadata: { archetype: 'treasure', biomeIndex: 0 },
          },
        ],
      ]),
      npcsByRoom: new Map(),
      bossesByRoom: new Map(),
    };
    const opts = buildRoomAssemblyOptions(
      'room_005',
      5,
      ctx,
      mediumDna,
      content,
      { value: 0 },
      () => false,
    );
    expect(opts.hasItemPickup).toBe(true);
    expect(opts.itemId).not.toBe('scrap');
    expect(opts.itemId).not.toBe('warden_seal');
    expect(opts.itemId).toBeTruthy();
    expect(content.items.find((item) => item.id === opts.itemId)?.category).not.toBe('collectible');
  });

  it('places collectibles in secret rooms and equipment in treasure rooms', () => {
    const roomIds = ['room_000', 'room_006'];
    const content = generateGameContent(mediumDna, 'MEDIUM', 42, 'room_006', roomIds);
    const collectibleId = content.items.find((item) => item.category === 'collectible')?.id;
    expect(collectibleId).toBeTruthy();

    const secretCtx = {
      roomIds,
      roomConnections: new Map(),
      worldGraphNodesById: new Map([
        [
          'room_006',
          {
            id: 'room_006',
            type: 'room' as const,
            label: 'Secret',
            metadata: { archetype: 'secret', biomeIndex: 0 },
          },
        ],
      ]),
      npcsByRoom: new Map(),
      bossesByRoom: new Map(),
    };
    const secretOpts = buildRoomAssemblyOptions(
      'room_006',
      6,
      secretCtx,
      mediumDna,
      content,
      { value: 0 },
      () => false,
    );
    expect(secretOpts.hasItemPickup).toBe(true);
    expect(content.items.find((item) => item.id === secretOpts.itemId)?.category).toBe('collectible');

    const picked = pickRoomPickupItem(content.items, 'treasure', 5);
    expect(picked).toBeTruthy();
    expect(picked?.category).not.toBe('collectible');
    expect(picked?.category).not.toBe('currency');
    expect(picked?.category).not.toBe('quest');
  });
});

describe('generateRoomScene weak floors', () => {
  it('embeds WeakFloor instances and split floor colliders', () => {
    const scene = generateRoomScene('room_001', 1, {
      hasEnemy: false,
      enemyIndex: 0,
      hasAbilityPickup: false,
      abilityPickups: [],
      isBossRoom: false,
      bossId: '',
      hasSavePoint: false,
      width: 800,
      height: 600,
      biomeIndex: 0,
      connections: [
        { direction: 'down', targetRoomId: 'room_002', requirements: ['ground_slam'] },
      ],
      hasTileset: false,
      tileSize: 16,
      npcs: [],
      hasItemPickup: false,
      itemId: '',
      itemAmount: 0,
    });

    expect(scene).toContain('WeakFloor.tscn');
    expect(scene).toContain('FloorLeft');
    expect(scene).toContain('FloorRight');
    expect(scene).toContain('position = Vector2(400, 536)');
  });
});

describe('generateRoomScene combat sprites', () => {
  const baseOptions = {
    hasAbilityPickup: false,
    abilityPickups: [] as string[],
    hasSavePoint: false,
    width: 800,
    height: 600,
    biomeIndex: 0,
    connections: [] as Array<{
      direction: 'left' | 'right' | 'up' | 'down';
      targetRoomId: string;
      requirements: string[];
    }>,
    hasTileset: false,
    tileSize: 16,
    npcs: [] as Array<{ id: string; name: string; role: string; questIds: string[] }>,
    hasItemPickup: false,
    itemId: '',
    itemAmount: 0,
  };

  it('wires enemy walk/hurt/attack sheets', () => {
    const scene = generateRoomScene('room_001', 1, {
      ...baseOptions,
      hasEnemy: true,
      enemyIndex: 2,
      isBossRoom: false,
      bossId: '',
    });
    expect(scene).toContain('assets/enemies/enemy_002_walk.png');
    expect(scene).toContain('assets/enemies/enemy_002_hurt.png');
    expect(scene).toContain('assets/enemies/enemy_002_attack.png');
  });

  it('wires boss walk/hurt/attack sheets', () => {
    const scene = generateRoomScene('room_boss', 1, {
      ...baseOptions,
      hasEnemy: false,
      enemyIndex: 0,
      isBossRoom: true,
      bossId: 'boss_final',
    });
    expect(scene).toContain('assets/bosses/boss_final_walk.png');
    expect(scene).toContain('assets/bosses/boss_final_hurt.png');
    expect(scene).toContain('assets/bosses/boss_final_attack.png');
  });

  it('embeds relic item pickups', () => {
    const scene = generateRoomScene('room_treasure', 3, {
      ...baseOptions,
      hasEnemy: false,
      enemyIndex: 0,
      isBossRoom: false,
      bossId: '',
      hasItemPickup: true,
      itemId: 'heart_relic',
      itemAmount: 1,
    });
    expect(scene).toContain('ItemPickup.tscn');
    expect(scene).toContain('item_id = "heart_relic"');
  });

  it('uses palette ColorRect backgrounds instead of stretched tileset atlases', () => {
    const scene = generateRoomScene('room_000', 0, {
      ...baseOptions,
      hasEnemy: false,
      enemyIndex: 0,
      isBossRoom: false,
      bossId: '',
      hasTileset: true,
      biomeTexturePath: 'assets/tilesets/biome_0/source.png',
    });
    expect(scene).toContain('[node name="Background" type="ColorRect"');
    expect(scene).not.toContain('stretch_mode = 6');
    expect(scene).toContain('RoomTileMap.gd');
    expect(scene).toContain('z_index = 0');
    expect(scene).toContain('visible = false');
  });

  it('aligns floor collision with the ground tile row when a tileset is present', () => {
    const scene = generateRoomScene('room_000', 0, {
      ...baseOptions,
      hasEnemy: false,
      enemyIndex: 0,
      isBossRoom: false,
      bossId: '',
      hasTileset: true,
      tileSize: 32,
      height: 600,
      biomeTexturePath: 'assets/tilesets/biome_0/source.png',
    });
    const floorTop = Math.max(1, Math.floor((600 - 32 * 2) / 32)) * 32;
    const thickness = 64;
    const floorCenter = floorTop + thickness / 2;
    expect(scene).toContain(`size = Vector2(800, ${thickness})`);
    expect(scene).toContain(`position = Vector2(400, ${floorCenter})`);
    expect(scene).toContain(`position = Vector2(100, ${floorTop})`);
  });
});
