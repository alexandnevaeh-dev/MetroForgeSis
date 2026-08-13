import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDeterministicEmbedder } from '@metroforge/ai';
import { buildProjectMemoryChunks } from './project-memory-chunks.js';
import {
  buildProjectMemoryIndex,
  loadProjectMemoryIndex,
  queryProjectMemoryWithIndex,
} from './project-memory-service.js';
import type { LoadedProject } from './project-loader.js';

function stubProject(): LoadedProject {
  return {
    projectPath: '',
    gameDna: {
      version: '0.1.0',
      archetype: 'SIDE_VIEW_METROIDVANIA',
      identity: { title: 'Ash Vault', tagline: 'Descend', genre: 'Metroidvania', tone: 'dark', visualStyle: 'pixel' },
      technical: { resolution: { width: 1280, height: 720 }, tileSize: 16, targetPlaytimeHours: 2, difficulty: 'normal' },
      combat: { style: 'melee', meleeEnabled: true, rangedEnabled: false },
      movement: { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 },
      abilities: [{ id: 'dash', name: 'Dash', category: 'movement', enabled: true }],
      world: { biomeCount: 1, roomCount: 4 },
      narrative: { premise: 'A vault awakens', protagonist: 'Scout', centralConflict: 'Seal the breach' },
      seed: 1,
      profile: 'TINY_TEST',
    },
    worldGraph: {
      version: '0.1.0',
      seed: 1,
      nodes: [],
      edges: [],
      regions: [{ id: 'region_0', name: 'Vault', biomeId: 'biome_0', roomIds: ['room_000', 'room_001'] }],
    },
    roomIds: ['room_000', 'room_001', 'room_002', 'room_003'],
    gameContent: {
      enemies: [{ id: 'enemy_000', name: 'Crawler', biomeId: 'biome_0', health: 20, damage: 5, speed: 60, movement: 'patrol', perception: { radius: 100, lineOfSight: true }, combat: { type: 'melee', cooldown: 1 } }],
      bosses: [{ id: 'boss_final', name: 'Warden', lore: 'Final', visualPrompt: 'boss', arenaRoomId: 'room_003', health: 200, phases: [{ phase: 1, healthThreshold: 1, attacks: ['slam'], telegraphDuration: 0.5, recoveryWindow: 1 }], weaknesses: [] }],
      quests: [{ id: 'quest_000', name: 'Awakening', description: 'Reach the vault', prerequisites: [], objectives: [{ id: 'obj_0', type: 'Reach', target: 'room_002', count: 1, description: 'Reach room_002' }], rewards: [{ type: 'currency', id: 'scrap', amount: 50 }] }],
      items: [],
      npcs: [{ id: 'npc_000', name: 'Mara', role: 'quest_giver', roomId: 'room_001', dialogueIds: [], questIds: ['quest_000'] }],
      dialogues: [],
      shops: [],
    },
    roomsData: {
      room_002: { archetype: 'traversal', connections: [{ direction: 'right', targetRoomId: 'room_003' }] },
      room_003: { archetype: 'boss' },
    },
    manifest: {},
    playtestRoute: { reachable: true, startRoomId: 'room_000', victoryRoomId: 'room_003', victoryBossId: 'boss_final', transitionCount: 3 },
  };
}

describe('buildProjectMemoryChunks', () => {
  it('extracts identity, quest, boss, and room chunks', () => {
    const chunks = buildProjectMemoryChunks(stubProject());
    expect(chunks.some((c) => c.category === 'identity' && c.text.includes('Ash Vault'))).toBe(true);
    expect(chunks.some((c) => c.category === 'boss' && c.text.includes('boss_final'))).toBe(true);
    expect(chunks.some((c) => c.category === 'room' && c.id === 'room-room_003')).toBe(true);
  });
});

describe('project-memory-service', () => {
  it('builds, saves, and queries a project memory index', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'metroforge-memory-'));
    const embedder = createDeterministicEmbedder();

    // Write minimal project files for loadProjectContext — use stub via direct index build path
    const project = stubProject();
    project.projectPath = dir;
    const { writeFileSync, mkdirSync } = await import('node:fs');
    mkdirSync(join(dir, 'data', 'rooms'), { recursive: true });
    mkdirSync(join(dir, 'data', 'enemies'), { recursive: true });
    mkdirSync(join(dir, 'data', 'bosses'), { recursive: true });
    mkdirSync(join(dir, 'data', 'quests'), { recursive: true });
    mkdirSync(join(dir, 'data', 'npcs'), { recursive: true });
    mkdirSync(join(dir, 'data', 'items'), { recursive: true });
    mkdirSync(join(dir, 'data', 'dialogues'), { recursive: true });
    mkdirSync(join(dir, 'data', 'shops'), { recursive: true });
    writeFileSync(join(dir, 'project.godot'), '; stub\n');
    writeFileSync(join(dir, 'game_dna.json'), JSON.stringify(project.gameDna));
    writeFileSync(join(dir, 'world_graph.json'), JSON.stringify(project.worldGraph));
    writeFileSync(join(dir, 'data', 'rooms', 'rooms.json'), JSON.stringify({ rooms: project.roomsData }));
    writeFileSync(join(dir, 'data', 'enemies', 'enemies.json'), JSON.stringify({ enemies: project.gameContent.enemies }));
    writeFileSync(join(dir, 'data', 'bosses', 'bosses.json'), JSON.stringify({ bosses: project.gameContent.bosses }));
    writeFileSync(join(dir, 'data', 'quests', 'quests.json'), JSON.stringify({ quests: project.gameContent.quests }));
    writeFileSync(join(dir, 'data', 'npcs', 'npcs.json'), JSON.stringify({ npcs: project.gameContent.npcs }));
    writeFileSync(join(dir, 'data', 'items', 'items.json'), JSON.stringify({ items: [] }));
    writeFileSync(join(dir, 'data', 'dialogues', 'dialogues.json'), JSON.stringify({ dialogues: [] }));
    writeFileSync(join(dir, 'data', 'shops', 'shops.json'), JSON.stringify({ shops: [] }));
    writeFileSync(join(dir, 'playtest_route.json'), JSON.stringify(project.playtestRoute));

    const index = await buildProjectMemoryIndex(dir, embedder, 'deterministic-embeddings');
    expect(index?.chunkCount).toBeGreaterThan(3);
    expect(loadProjectMemoryIndex(dir)?.provider).toBe('deterministic-embeddings');

    expect(index?.chunks.some((c) => c.text.includes('boss_final'))).toBe(true);

    const context = await queryProjectMemoryWithIndex(
      index!,
      'Where is the final boss?',
      embedder,
      index!.chunkCount,
    );
    expect(context).toContain('boss_final');

    rmSync(dir, { recursive: true, force: true });
  });
});
