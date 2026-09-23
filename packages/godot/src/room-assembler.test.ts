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
  buildRoomConnections,
  resolveFloorPropPlacements,
} from '../src/room-assembler.js';
import { foundryBackdropCoverScale } from '../src/foundry-visual-pack.js';
import { generateWorldTopology } from '@metroforge/procedural';
import { generateGameContent } from '@metroforge/procedural';
import { GameDNASchema } from '@metroforge/schemas';

describe('buildRoomConnections (seventeenth-session regression)', () => {
  // Two connections in the same room sharing a `direction` are placed only ~48px apart along
  // the *same* walk line (see generateRoomScene's directionSlot spacing) — reaching the farther
  // door means physically walking through the nearer one's sensor first, which fires the wrong
  // transition. This was the real, confirmed cause of the disclosed `door_did_not_fire` failures
  // whose reported "current" room was neither the transition's `from` nor its intended `to`.
  // Swept 60 seeds x 7 room counts x 4 biome counts (62,160 rooms total) directly against this
  // function's own output — reverted the fix locally to confirm this fails without it (16
  // collisions surfaced at roomCount>=50 before the shortcut-touch cap; the far larger,
  // dominant class — 7-9 per 42-room world on every seed — before either fix).
  it('never assigns two connections in the same room the same direction', () => {
    const seeds = [1, 42, 137, 777, 999, 20260908, 20260909, 20260910, 20260911];
    const roomCounts = [12, 15, 30, 42, 60, 80];
    const biomeCounts = [1, 2, 3, 4];
    const violations: string[] = [];
    for (const seed of seeds) {
      for (const roomCount of roomCounts) {
        for (const biomeCount of biomeCounts) {
          const { worldGraph, roomIds } = generateWorldTopology({
            seed,
            roomCount,
            biomeCount,
            abilities: ['dash', 'ground_slam', 'grapple'],
            bossCount: 1,
            profile: 'SMALL',
          });
          const connections = buildRoomConnections(roomIds, worldGraph.edges);
          for (const [roomId, conns] of connections) {
            const byDirection = new Map<string, number>();
            for (const c of conns) {
              byDirection.set(c.direction, (byDirection.get(c.direction) ?? 0) + 1);
            }
            for (const [direction, count] of byDirection) {
              if (count > 1) {
                violations.push(
                  `seed=${seed} roomCount=${roomCount} biomeCount=${biomeCount} room=${roomId} direction=${direction} count=${count}`,
                );
              }
            }
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

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

  it('places a biome pool in flooded rooms that have no swim gate', () => {
    const zones = deriveWaterZones([], 960, 500, { biomePool: true, floorTop: 476 });
    expect(zones).toHaveLength(1);
    expect(zones[0]).toMatchObject({
      targetRoomId: 'biome_pool',
      height: 96,
      y: 380,
    });
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
  it('emits a real SavePoint scene for a small generated world', () => {
    const { worldGraph, roomIds } = generateWorldTopology({
      seed: 424242, roomCount: 8, biomeCount: 1, abilities: ['dash'], bossCount: 1,
    });
    const ctx = prepareRoomAssemblyContext(worldGraph, undefined, roomIds);
    const counter = { value: 0 };
    const saveScenes = roomIds.flatMap((id, index) => {
      const options = buildRoomAssemblyOptions(id, index, ctx, mediumDna, undefined, counter, () => false);
      return options.hasSavePoint ? [generateRoomScene(id, index, options)] : [];
    });
    expect(saveScenes.length).toBeGreaterThan(0);
    for (const scene of saveScenes) {
      expect(scene).toContain('res://scenes/world/SavePoint.tscn');
      expect(scene).toContain('[node name="SavePoint"');
    }
  });

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

  it('uses valid resource references without fake uid:// names', () => {
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
      connections: [],
      hasTileset: false,
      tileSize: 16,
      npcs: [],
      hasItemPickup: false,
      itemId: '',
      itemAmount: 0,
    });

    expect(scene).toContain('[ext_resource type="PackedScene" path="res://scenes/world/RoomTransition.tscn" id="5_transition"]');
    expect(scene).not.toContain('uid="uid://');
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

  it('puts the far sky on a room-space Sprite2D and omits stacked parallax strips', () => {
    const scene = generateRoomScene('room_000', 0, {
      ...baseOptions,
      width: 800,
      height: 600,
      hasEnemy: false,
      enemyIndex: 0,
      isBossRoom: false,
      bossId: '',
      backgroundLayers: {
        far: 'assets/backgrounds/biome_0/far.png',
        mid: 'assets/backgrounds/biome_0/mid.png',
        near: 'assets/backgrounds/biome_0/near.png',
        overlay: 'assets/backgrounds/biome_0/overlay.png',
        foreground: 'assets/backgrounds/biome_0/foreground.png',
      },
    });
    expect(scene).toContain('[node name="FarSky" type="Sprite2D"');
    expect(scene).not.toContain('type="CanvasLayer"');
    const farScale = Math.min(800 / 640, 600 / 360) * 1.08;
    expect(scene).toContain(`scale = Vector2(${farScale.toFixed(4)}, ${farScale.toFixed(4)})`);
    expect(scene).toContain('assets/backgrounds/biome_0/far.png');
    expect(scene).not.toContain('[node name="ParallaxBg"');
    expect(scene).not.toContain('[node name="far" type="Parallax2D"');
    expect(scene).toContain('[node name="ParallaxMid" type="Parallax2D"');
    expect(scene).toContain('[node name="ParallaxNear" type="Parallax2D"');
    expect(scene).toContain('scroll_scale = Vector2(0.3, 0.12)');
    expect(scene).toContain('scroll_scale = Vector2(0.65, 0.2)');
    expect(scene).toContain('position = Vector2(400, 300)');
    expect(scene).not.toContain('overlay.png');
    expect(scene).not.toContain('foreground.png');
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
    expect(scene).toContain('visible = true');
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

  it('does not wallpaper playable-air cells into painted_cells_json', () => {
    const layoutCells = [
      { x: 0, y: 16, col: 0, row: 0 },
      { x: 6, y: 13, col: 3, row: 0 },
    ];
    const scene = generateRoomScene('room_000', 0, {
      ...baseOptions,
      hasEnemy: false,
      enemyIndex: 0,
      isBossRoom: false,
      bossId: '',
      hasTileset: true,
      tileSize: 32,
      tileCells: layoutCells,
      biomeTexturePath: 'assets/tilesets/biome_0/source.png',
    });
    const match = scene.match(/painted_cells_json = "(\[[\s\S]*?\])"/);
    expect(match).not.toBeNull();
    const painted = JSON.parse((match as RegExpMatchArray)[1]!.replace(/\\"/g, '"')) as number[][];
    expect(painted).toEqual([
      [0, 16, 0, 0],
      [6, 13, 3, 0],
    ]);
    expect(scene).toContain('script = ExtResource("6_tilemap")');
    expect(scene).toContain('painted_cells_json');
  });

  it('uses the Foundry corridor plate instead of VGF mid/near wallpaper', () => {
    const scene = generateRoomScene('room_000', 0, {
      ...baseOptions,
      width: 960,
      height: 540,
      hasEnemy: false,
      enemyIndex: 0,
      isBossRoom: false,
      bossId: '',
      hasTileset: true,
      tileSize: 32,
      visualKit: 'foundry',
      biomeTexturePath: 'assets/tilesets/biome_0/source.png',
      backgroundLayers: {
        far: 'assets/backgrounds/biome_0/far.png',
        mid: 'assets/backgrounds/biome_0/mid.png',
        near: 'assets/backgrounds/biome_0/near.png',
      },
    });
    const farScale = foundryBackdropCoverScale(960, 540);
    expect(scene).toContain('visual_kit = "foundry"');
    expect(scene).toContain('[node name="FarSky" type="Sprite2D"');
    expect(scene).toContain('z_index = -90');
    expect(scene).toContain(`scale = Vector2(${farScale.toFixed(4)}, ${farScale.toFixed(4)})`);
    expect(scene).toContain('color = Color(0.075, 0.118, 0.173, 1)');
    expect(scene).not.toContain('[node name="ParallaxMid"');
    expect(scene).not.toContain('[node name="ParallaxNear"');
    expect(scene).not.toContain('assets/backgrounds/biome_0/mid.png');
    expect(scene).not.toContain('assets/backgrounds/biome_0/near.png');
  });

  it('emits authored mid/near parallax plates for foundry-themed courier kits', () => {
    const scene = generateRoomScene('room_000', 0, {
      ...baseOptions,
      width: 960,
      height: 540,
      hasEnemy: false,
      enemyIndex: 0,
      isBossRoom: false,
      bossId: '',
      hasTileset: true,
      tileSize: 32,
      visualKit: 'foundry',
      authoredParallax: true,
      biomeTexturePath: 'assets/tilesets/biome_0/source.png',
      backgroundLayers: {
        far: 'assets/backgrounds/biome_0/far.png',
        mid: 'assets/backgrounds/biome_0/mid.png',
        near: 'assets/backgrounds/biome_0/near.png',
      },
    });
    expect(scene).toContain('[node name="ParallaxMid" type="Parallax2D"');
    expect(scene).toContain('[node name="ParallaxNear" type="Parallax2D"');
    expect(scene).toContain('assets/backgrounds/biome_0/mid.png');
    expect(scene).toContain('scroll_scale = Vector2(0.3, 0.12)');
  });

  it('emits wall architecture and edge foreground for authored foundry kits', () => {
    const scene = generateRoomScene('room_000', 0, {
      ...baseOptions,
      width: 960,
      height: 540,
      hasEnemy: false,
      enemyIndex: 0,
      isBossRoom: false,
      bossId: '',
      hasTileset: true,
      tileSize: 32,
      visualKit: 'foundry',
      authoredParallax: true,
      biomeTexturePath: 'assets/tilesets/biome_0/source.png',
      backgroundLayers: {
        far: 'assets/backgrounds/biome_0/far.png',
        mid: 'assets/backgrounds/biome_0/mid.png',
        near: 'assets/backgrounds/biome_0/near.png',
        foreground: 'assets/backgrounds/biome_0/foreground.png',
      },
      architectureSprites: [
        'assets/architecture/biome_0/biome_0_arch_0.png',
        'assets/architecture/biome_0/biome_0_arch_1.png',
      ],
    });
    expect(scene).toContain('[node name="Architecture_0"');
    expect(scene).toContain('assets/architecture/biome_0/biome_0_arch_0.png');
    expect(scene).toContain('[node name="ParallaxForeground"');
    expect(scene).toContain('assets/backgrounds/biome_0/foreground.png');
  });

  it('places authored floor props even when the combat prop budget is zero', () => {
    const scene = generateRoomScene('room_000', 0, {
      ...baseOptions,
      width: 960,
      height: 540,
      hasEnemy: false,
      enemyIndex: 0,
      isBossRoom: false,
      bossId: '',
      authoredParallax: true,
      propSprites: [
        'assets/props/biome_0/biome_0_prop_0.png',
        'assets/props/biome_0/biome_0_prop_1.png',
        'assets/props/biome_0/biome_0_prop_2.png',
        'assets/props/biome_0/biome_0_prop_3.png',
      ],
    });
    expect(scene).toContain('[node name="EnvProp_0"');
    expect(scene).toContain('assets/props/biome_0/biome_0_prop_0.png');
    const placed = resolveFloorPropPlacements({
      width: 960,
      authoredParallax: true,
      isBossRoom: false,
      propSprites: ['assets/props/biome_0/biome_0_prop_0.png', 'assets/props/biome_0/biome_0_prop_1.png'],
    });
    expect(placed.length).toBe(2);
    const bossClear = resolveFloorPropPlacements({
      width: 960,
      authoredParallax: true,
      isBossRoom: true,
      propSprites: ['assets/props/biome_0/biome_0_prop_0.png'],
    });
    expect(bossClear.length).toBe(0);
  });

  it('places a WaterZone in flooded biome rooms without a swim-gated door', () => {
    const scene = generateRoomScene('room_004', 4, {
      ...baseOptions,
      biomeIndex: 1,
      hasEnemy: false,
      enemyIndex: 0,
      isBossRoom: false,
      bossId: '',
      hasTileset: true,
      tileSize: 32,
      width: 960,
      height: 540,
      connections: [{ direction: 'right', targetRoomId: 'room_005', requirements: [] }],
    });
    expect(scene).toContain('WaterZone.tscn');
    expect(scene).toContain('WaterZone_biome_pool');
    expect(scene).toContain('zone_height = 96');
  });
});

describe('generateRoomScene shell colliders', () => {
  const sealed = {
    hasEnemy: false,
    enemyIndex: 0,
    hasAbilityPickup: false,
    abilityPickups: [] as string[],
    isBossRoom: false,
    bossId: '',
    hasSavePoint: false,
    width: 800,
    height: 600,
    biomeIndex: 0,
    connections: [] as Array<{
      direction: 'left' | 'right' | 'up' | 'down';
      targetRoomId: string;
      requirements: string[];
    }>,
    hasTileset: true,
    tileSize: 16,
    npcs: [] as Array<{ id: string; name: string; role: string; questIds: string[] }>,
    hasItemPickup: false,
    itemId: '',
    itemAmount: 0,
  };

  it('emits wall and ceiling shells so jump/dash cannot leave a sealed room', () => {
    const scene = generateRoomScene('room_000', 0, sealed);
    expect(scene).toContain('[node name="ShellLeft"');
    expect(scene).toContain('[node name="ShellRight"');
    expect(scene).toContain('[node name="ShellCeiling"');
    expect(scene).toContain('id="shell_0_shape"');
  });

  it('keeps a left door opening instead of a full-height wall', () => {
    const scene = generateRoomScene('room_001', 1, {
      ...sealed,
      connections: [{ direction: 'left', targetRoomId: 'room_000', requirements: [] }],
    });
    expect(scene).toContain('[node name="ShellLeftUpper"');
    expect(scene).not.toContain('[node name="ShellLeft" type="StaticBody2D"');
    expect(scene).toContain('[node name="ShellRight"');
  });

  it('places a down exit below the floor so pit falls can reach it', () => {
    const scene = generateRoomScene('room_002', 2, {
      ...sealed,
      hasTileset: false,
      connections: [
        { direction: 'left', targetRoomId: 'room_001', requirements: [] },
        { direction: 'right', targetRoomId: 'room_003', requirements: [] },
        { direction: 'down', targetRoomId: 'room_010', requirements: [] },
      ],
    });
    expect(scene).toContain('Transition_down_room_010');
    expect(scene).toContain('position = Vector2(388, 632)');
    expect(scene).not.toContain('position = Vector2(388, 120)');
  });
});

  it('keeps procedural masonry atlas coords for authored foundry kits', () => {
    const ctx = {
      roomIds: ['room_000'],
      roomConnections: new Map([['room_000', []]]),
      worldGraphNodesById: new Map([
        ['room_000', { id: 'room_000', type: 'room', label: 'Start', metadata: { archetype: 'tutorial' } }],
      ]),
      npcsByRoom: new Map(),
      bossesByRoom: new Map(),
    } as import('../src/room-assembler.js').RoomAssemblyContext;
    const v3 = buildRoomAssemblyOptions(
      'room_000',
      0,
      ctx,
      mediumDna,
      undefined,
      { value: 0 },
      () => true,
      { visualKit: 'foundry' },
    );
    const authored = buildRoomAssemblyOptions(
      'room_000',
      0,
      ctx,
      mediumDna,
      undefined,
      { value: 0 },
      () => true,
      { visualKit: 'foundry', authoredParallax: true },
    );
    const v3Platform = v3.tileCells?.find((c) => c.col === 2 && c.row === 0);
    const authoredPlatform = authored.tileCells?.find((c) => c.col === 3 && c.row === 0);
    expect(authoredPlatform).toBeTruthy();
    expect(v3Platform).toBeTruthy();
  });


// These limits express the requested multi-screen castle scale at the Unity
// camera's 240-unit vertical view, rather than duplicating every preset value.
describe('multi-screen castle room sizing', () => {
  function assemble(archetype: string, dimensions?: { width: number; height: number }) {
    const ctx = {
      roomIds: ['room_000'], roomConnections: new Map([['room_000', []]]),
      worldGraphNodesById: new Map([['room_000', { id: 'room_000', type: 'room', label: 'Castle', metadata: { archetype } }]]),
      npcsByRoom: new Map(), bossesByRoom: new Map(),
    } as import('../src/room-assembler.js').RoomAssemblyContext;
    return buildRoomAssemblyOptions('room_000', 0, ctx, mediumDna, undefined, { value: 0 }, () => false, dimensions);
  }
  it.each(['tutorial', 'combat', 'connector', 'traversal', 'set_piece'])('gives %s at least three camera widths and vertical exploration space', archetype => {
    const room = assemble(archetype);
    expect(room.width).toBeGreaterThanOrEqual(3 * 240 * 16 / 9);
    expect(room.height).toBeGreaterThanOrEqual(3 * 240);
    expect(room.width % 16).toBe(0);
    expect(room.height % 16).toBe(0);
  });
  it('keeps rest stops smaller than grand traversal halls', () => {
    expect(assemble('save').width).toBeLessThan(assemble('traversal').width / 2);
  });
  it('preserves explicit editor-authored room dimensions', () => {
    const room = assemble('traversal', { width: 720, height: 520 });
    expect([room.width, room.height]).toEqual([720, 520]);
  });
});
