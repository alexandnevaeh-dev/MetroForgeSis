import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadProjectContext } from './project-loader.js';

function writeMinimalProject(projectPath: string): void {
  writeFileSync(join(projectPath, 'project.godot'), '; Engine configuration file\n');
  writeFileSync(
    join(projectPath, 'game_dna.json'),
    JSON.stringify({
      version: '0.1.0',
      profile: 'TINY_TEST',
      seed: 42,
      identity: {
        title: 'Playtest Demo',
        genre: 'Metroidvania',
        tone: 'dark',
        visualStyle: 'pixel',
      },
      technical: {
        resolution: { width: 1920, height: 1080 },
        tileSize: 16,
        targetPlaytimeHours: 1,
        difficulty: 'normal',
      },
      combat: { style: 'fast melee', meleeEnabled: true, rangedEnabled: false },
      movement: { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 },
      abilities: [{ id: 'dash', name: 'Dash', category: 'movement', enabled: true }],
      world: { biomeCount: 1, roomCount: 2 },
      narrative: {
        premise: 'Test premise',
        protagonist: 'Tester',
        centralConflict: 'test',
      },
    }),
  );
  writeFileSync(
    join(projectPath, 'world_graph.json'),
    JSON.stringify({
      version: '0.1.0',
      seed: 42,
      nodes: [
        { id: 'room_000', type: 'room', label: 'Start', metadata: {} },
        { id: 'room_001', type: 'room', label: 'End', metadata: {} },
      ],
      edges: [{ id: 'edge_0', from: 'room_000', to: 'room_001', bidirectional: true, requirements: [] }],
      regions: [],
    }),
  );
  mkdirSync(join(projectPath, 'data', 'rooms'), { recursive: true });
  writeFileSync(
    join(projectPath, 'data', 'rooms', 'rooms.json'),
    JSON.stringify({ rooms: { room_000: { index: 0 }, room_001: { index: 1 } } }),
  );
  mkdirSync(join(projectPath, 'data', 'enemies'), { recursive: true });
  writeFileSync(join(projectPath, 'data', 'enemies', 'enemies.json'), JSON.stringify({ enemies: [] }));
  mkdirSync(join(projectPath, 'data', 'bosses'), { recursive: true });
  writeFileSync(
    join(projectPath, 'data', 'bosses', 'bosses.json'),
    JSON.stringify({ bosses: [{ id: 'boss_final' }] }),
  );
  mkdirSync(join(projectPath, 'data', 'quests'), { recursive: true });
  writeFileSync(join(projectPath, 'data', 'quests', 'quests.json'), JSON.stringify({ quests: [] }));
  mkdirSync(join(projectPath, 'data', 'items'), { recursive: true });
  writeFileSync(join(projectPath, 'data', 'items', 'items.json'), JSON.stringify({ items: [] }));
  mkdirSync(join(projectPath, 'data', 'npcs'), { recursive: true });
  writeFileSync(join(projectPath, 'data', 'npcs', 'npcs.json'), JSON.stringify({ npcs: [] }));
  mkdirSync(join(projectPath, 'data', 'dialogues'), { recursive: true });
  writeFileSync(join(projectPath, 'data', 'dialogues', 'dialogues.json'), JSON.stringify({ dialogues: [] }));
  mkdirSync(join(projectPath, 'data', 'shops'), { recursive: true });
  writeFileSync(join(projectPath, 'data', 'shops', 'shops.json'), JSON.stringify({ shops: [] }));
}

describe('loadProjectContext playtest dashboard data', () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), 'metroforge-loader-'));
    writeMinimalProject(projectPath);
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  it('loads playtest route and telemetry summaries for dashboard IPC', () => {
    writeFileSync(
      join(projectPath, 'playtest_route.json'),
      JSON.stringify({
        reachable: true,
        startRoomId: 'room_000',
        victoryRoomId: 'room_001',
        victoryBossId: 'boss_final',
        transitions: [{ fromRoomId: 'room_000', toRoomId: 'room_001', requirements: [] }],
        persona: { id: 'victory_rusher', displayName: 'Victory Rusher' },
      }),
    );
    writeFileSync(
      join(projectPath, 'playtest_telemetry.json'),
      JSON.stringify({
        personaId: 'victory_rusher',
        elapsedMs: 4200,
        transitionsPlanned: 1,
        transitionsCompleted: 1,
        pickupsCollected: 2,
        attacksPerformed: 5,
        abilitiesAfterRun: ['dash'],
        roomsVisited: ['room_000', 'room_001'],
        victoryBossId: 'boss_final',
        bossFightMs: 800,
        avgTransitionMs: 1200,
        inputSimulationUsed: true,
        victoryState: true,
        gameComplete: true,
        balanceHints: ['boss_fight_over_10s'],
        balanceSummary: ['route_completion_100pct'],
      }),
    );

    const project = loadProjectContext(projectPath);

    expect(project.playtestRoute).toEqual({
      reachable: true,
      startRoomId: 'room_000',
      victoryRoomId: 'room_001',
      victoryBossId: 'boss_final',
      transitionCount: 1,
      personaId: 'victory_rusher',
      personaDisplayName: 'Victory Rusher',
    });
    expect(project.playtestTelemetry?.personaId).toBe('victory_rusher');
    expect(project.playtestTelemetry?.balanceSummary).toEqual(['route_completion_100pct']);
  });

  it('loads project memory summary for dashboard IPC', () => {
    writeFileSync(
      join(projectPath, 'project_memory.json'),
      JSON.stringify({
        version: '0.1.0',
        chunkCount: 12,
        provider: 'ollama',
        model: 'nomic-embed-text',
        createdAt: '2026-08-13T05:00:00.000Z',
        chunks: [],
      }),
    );

    const project = loadProjectContext(projectPath);

    expect(project.projectMemory).toEqual({
      chunkCount: 12,
      provider: 'ollama',
      model: 'nomic-embed-text',
      createdAt: '2026-08-13T05:00:00.000Z',
    });
  });
});
