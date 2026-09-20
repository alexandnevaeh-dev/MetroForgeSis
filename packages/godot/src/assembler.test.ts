import { describe, it, expect } from 'vitest';
import { mkdirSync, rmSync, readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GodotProjectAssembler, getTemplatePath, topDownChestItemDefs } from '../src/assembler.js';
import type { GameDNA, ProgressionGraph, WorldGraph } from '@metroforge/schemas';
import type { TopDownOverworld } from '@metroforge/procedural';

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
    expect(room0).toContain('ColorRect');
    expect(room0).toContain('RoomTileMap.gd');
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

  it('merges existing generation_manifest artifacts instead of wiping them on reassemble', () => {
    const outputDir = join(tmpdir(), `metroforge-assembler-merge-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });
    const roomIds = ['room_000', 'room_001', 'room_002'];
    const worldGraph: WorldGraph = {
      version: '0.1.0',
      seed: 1,
      nodes: roomIds.map((id) => ({ id, type: 'room' as const, label: id, metadata: {} })),
      edges: [],
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
    assembler.assemble({
      outputDir,
      gameDna: minimalDna,
      worldGraph,
      progressionGraph,
      roomIds,
      assetMetadata: [
        {
          id: 'tileset_biome_0',
          path: 'assets/tilesets/biome_0/source.png',
          type: 'texture',
          provider: 'nvidia',
          fallbackGenerated: false,
        },
      ],
    });
    assembler.assemble({
      outputDir,
      gameDna: minimalDna,
      worldGraph,
      progressionGraph,
      roomIds,
    });
    const manifest = JSON.parse(readFileSync(join(outputDir, 'generation_manifest.json'), 'utf-8')) as {
      artifacts: Array<{ id: string }>;
    };
    expect(manifest.artifacts.some((a) => a.id === 'tileset_biome_0')).toBe(true);
    const projectGodot = readFileSync(join(outputDir, 'project.godot'), 'utf-8');
    expect(projectGodot).toContain('window/size/viewport_width=1280');
    expect(projectGodot).toContain('window/size/viewport_height=720');
    expect(projectGodot).not.toContain('window/stretch/aspect="integer"');
    rmSync(outputDir, { recursive: true, force: true });
  });

  it('topDownChestItemDefs does not shadow a real item definition with a bare stub', () => {
    // Regression for the bug RuntimeSmokeTest.gd's item_pickup_consumable_can_be_triggered
    // caught: a chest rewarding "health_vial" (already a real consumable with a heal effect in
    // realItems) used to always get a second, effect-less stub appended after it in items.json,
    // and InventoryManager's last-wins-by-id lookup picked that stub — so the pickup ran but
    // healed nothing. Same shape for a dnaAbility id ("wind_disc") that's also a real item.
    const overworld: TopDownOverworld = {
      version: '0.1.0',
      seed: 1,
      worldStyle: 'continuous',
      startAreaId: 'overworld',
      victoryAreaId: 'dungeon_000_r0',
      chunkCols: 1,
      chunkRows: 1,
      chunkWidthTiles: 8,
      chunkHeightTiles: 8,
      regions: [{ id: 'region_0', name: 'R0', theme: 'marsh' }],
      dungeonItemId: 'wind_disc',
      dungeonItemsById: {},
      areas: [
        {
          id: 'overworld',
          name: 'Overworld',
          kind: 'overworld',
          widthTiles: 8,
          heightTiles: 8,
          tileSize: 32,
          tiles: [],
          collisionRects: [],
          pois: [
            { id: 'chest_0', areaId: 'overworld', kind: 'chest', x: 0, y: 0, metadata: { itemId: 'health_vial' } },
            { id: 'chest_1', areaId: 'overworld', kind: 'chest', x: 0, y: 0, metadata: { itemId: 'dungeon_000_key' } },
          ],
        },
      ],
    };
    const realItems = [
      { id: 'health_vial', category: 'consumable', effects: [{ type: 'heal', value: 30 }] },
      { id: 'wind_disc', category: 'relic', effects: [] },
    ];
    const defs = topDownChestItemDefs(overworld, [{ id: 'wind_disc', name: 'Wind Disc' }], realItems);
    const ids = defs.map((d) => d.id);
    expect(ids).not.toContain('health_vial');
    expect(ids).not.toContain('wind_disc');
    expect(ids).toContain('dungeon_000_key');
  });

  it('overlays authored 160px boss_final sheets for foundry-themed side-view games', () => {
    const outputDir = join(tmpdir(), `metroforge-polish-overlay-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });
    const roomIds = ['room_000'];
    const worldGraph: WorldGraph = {
      version: '0.1.0',
      seed: 1,
      nodes: [{ id: 'room_000', type: 'room', label: 'room_000', metadata: { biomeIndex: 0 } }],
      edges: [],
      regions: [{ id: 'region_0', name: 'R0', biomeId: 'biome_0', roomIds }],
    };
    const progressionGraph: ProgressionGraph = {
      version: '0.1.0',
      seed: 1,
      startNodeId: 'room_000',
      endNodeId: 'room_000',
      nodes: [],
      edges: [],
      abilities: [],
      criticalPath: roomIds,
    };
    const assembler = new GodotProjectAssembler();
    const result = assembler.assemble({
      outputDir,
      gameDna: minimalDna,
      worldGraph,
      progressionGraph,
      roomIds,
      foundryThemed: true,
      textureFiles: new Map([['assets/bosses/boss_final_walk.png', Buffer.from('not-a-real-png')]]),
    });
    expect(result.success).toBe(true);
    const overlaid = join(outputDir, 'assets/bosses/boss_final_walk.png');
    const authored = join(getTemplatePath(), 'assets/bosses/boss_final_walk.png');
    expect(existsSync(overlaid)).toBe(true);
    expect(statSync(overlaid).size).toBe(statSync(authored).size);
    rmSync(outputDir, { recursive: true, force: true });
  });

  it('assembles flooded-biome WaterZones and authored parallax without fixture patches', () => {
    const outputDir = join(tmpdir(), `metroforge-water-parallax-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });
    const roomIds = ['room_000', 'room_001', 'room_002'];
    const worldGraph: WorldGraph = {
      version: '0.1.0',
      seed: 1,
      nodes: roomIds.map((id, i) => ({
        id,
        type: 'room',
        label: id,
        metadata: { biomeIndex: i, archetype: 'combat' },
      })),
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
      regions: roomIds.map((id, i) => ({
        id: `region_${i}`,
        name: `R${i}`,
        biomeId: `biome_${i}`,
        roomIds: [id],
      })),
    };
    const progressionGraph: ProgressionGraph = {
      version: '0.1.0',
      seed: 1,
      startNodeId: 'room_000',
      endNodeId: 'room_002',
      nodes: [],
      edges: [],
      abilities: [],
      criticalPath: roomIds,
    };
    const assembler = new GodotProjectAssembler();
    const result = assembler.assemble({
      outputDir,
      gameDna: { ...minimalDna, identity: { ...minimalDna.identity, title: 'Foundry Courier' }, world: { biomeCount: 3, roomCount: 3 } },
      worldGraph,
      progressionGraph,
      roomIds,
      foundryThemed: true,
    });
    expect(result.success).toBe(true);
    const flooded = readFileSync(join(outputDir, 'scenes/rooms/room_001.tscn'), 'utf8');
    expect(flooded).toContain('WaterZone.tscn');
    expect(flooded).toContain('WaterZone_biome_pool');
    expect(flooded).toContain('[node name="ParallaxMid"');
    const foundry = readFileSync(join(outputDir, 'scenes/rooms/room_000.tscn'), 'utf8');
    expect(foundry).not.toContain('WaterZone.tscn');
    expect(foundry).toContain('[node name="ParallaxMid"');
    const rooms = JSON.parse(readFileSync(join(outputDir, 'data/rooms/rooms.json'), 'utf8')) as {
      rooms: Record<string, { waterZones?: unknown[] }>;
    };
    expect(rooms.rooms.room_001?.waterZones?.length).toBeGreaterThan(0);
    rmSync(outputDir, { recursive: true, force: true });
  });

  it('excludes rollback baselines and retags overlaid authored art in the manifest', () => {
    const outputDir = join(tmpdir(), `metroforge-baseline-overlay-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });
    const roomIds = ['room_000'];
    const worldGraph: WorldGraph = {
      version: '0.1.0',
      seed: 1,
      nodes: [{ id: 'room_000', type: 'room', label: 'room_000', metadata: { biomeIndex: 0, archetype: 'combat' } }],
      edges: [],
      regions: [{ id: 'region_0', name: 'R0', biomeId: 'biome_0', roomIds }],
    };
    const progressionGraph: ProgressionGraph = {
      version: '0.1.0',
      seed: 1,
      startNodeId: 'room_000',
      endNodeId: 'room_000',
      nodes: [],
      edges: [],
      abilities: [],
      criticalPath: roomIds,
    };
    mkdirSync(join(outputDir, 'assets', '_baseline_v1'), { recursive: true });
    writeFileSync(join(outputDir, 'assets', '_baseline_v1', 'stale.png'), 'stale');
    const assembler = new GodotProjectAssembler();
    const result = assembler.assemble({
      outputDir,
      gameDna: { ...minimalDna, identity: { ...minimalDna.identity, title: 'Ashen Foundry' } },
      worldGraph,
      progressionGraph,
      roomIds,
      foundryThemed: true,
      assetMetadata: [
        {
          id: 'bg_biome_0_far',
          path: 'assets/backgrounds/biome_0/far.png',
          type: 'texture',
          provider: 'procedural',
          fallbackGenerated: true,
          sourceType: 'procedural',
          maturity: 'PROCEDURAL_PRODUCTION',
        },
        {
          id: 'player_idle',
          path: 'assets/characters/player_idle.png',
          type: 'texture',
          provider: 'procedural',
          fallbackGenerated: true,
          sourceType: 'procedural',
          maturity: 'REJECTED',
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(existsSync(join(outputDir, 'assets/_baseline_v1'))).toBe(false);
    expect(existsSync(join(outputDir, 'assets/_baseline_foundry_pass1'))).toBe(false);
    expect(existsSync(join(outputDir, 'assets/_polish_preview'))).toBe(false);
    expect(existsSync(join(getTemplatePath(), 'assets/_baseline_v1'))).toBe(true);
    expect(existsSync(join(outputDir, 'assets/props/biome_0/biome_0_prop_0.png'))).toBe(true);
    const scene = readFileSync(join(outputDir, 'scenes/rooms/room_000.tscn'), 'utf8');
    expect(scene).toContain('EnvProp_');
    const manifest = JSON.parse(readFileSync(join(outputDir, 'generation_manifest.json'), 'utf-8')) as {
      artifacts: Array<{ path?: string; provider?: string; sourceType?: string; fallbackGenerated?: boolean; maturity?: string }>;
    };
    const far = manifest.artifacts.find((a) => a.path === 'assets/backgrounds/biome_0/far.png');
    expect(far?.provider).toBe('authored-original');
    expect(far?.sourceType).toBe('manual');
    expect(far?.fallbackGenerated).toBe(false);
    expect(far?.maturity).toBe('QA_REVIEW');
    const idle = manifest.artifacts.find((a) => a.path === 'assets/characters/player_idle.png');
    expect(idle?.provider).toBe('authored-original');
    expect(idle?.maturity).toBe('QA_REVIEW');
    rmSync(outputDir, { recursive: true, force: true });
  });
});
