import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { GameDNA, ProgressionGraph, WorldGraph } from '@metroforge/schemas';
import { UnityProjectAssembler } from './assembler.js';

const dna: GameDNA = {
  version: '0.1.0',
  archetype: 'SIDE_VIEW_METROIDVANIA',
  identity: { title: 'Unity Slice', genre: 'Metroidvania', tone: 'dark', visualStyle: 'pixel art' },
  technical: { resolution: { width: 1920, height: 1080 }, tileSize: 16, targetPlaytimeHours: 1, difficulty: 'normal' },
  combat: { style: 'melee', meleeEnabled: true, rangedEnabled: false },
  movement: { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 },
  abilities: [{ id: 'dash', name: 'Dash', category: 'movement', enabled: true }],
  world: { biomeCount: 1, roomCount: 3 },
  narrative: { premise: 'Test', protagonist: 'Courier', centralConflict: 'Pour' },
  seed: 7,
  profile: 'TINY_TEST',
};

describe('UnityProjectAssembler', () => {
  it('writes a Unity 6.3 2D project without Godot runtime files', () => {
    const outputDir = join(tmpdir(), `mf-unity-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });
    const roomIds = ['room_000', 'room_001', 'room_002'];
    const worldGraph: WorldGraph = {
      version: '0.1.0',
      seed: 7,
      nodes: [
        { id: 'room_000', type: 'room', label: 'Start', metadata: { grantsAbilities: ['dash'] } },
        { id: 'room_001', type: 'room', label: 'Gate', metadata: {} },
        { id: 'room_002', type: 'room', label: 'End', metadata: { archetype: 'save' } },
      ],
      edges: [
        { id: 'e1', from: 'room_000', to: 'room_001', requirements: ['dash'], optional: false, bidirectional: true },
        { id: 'e2', from: 'room_001', to: 'room_002', requirements: [], optional: false, bidirectional: true },
      ],
      regions: [{ id: 'region_0', name: 'R0', biomeId: 'biome_0', roomIds }],
    };
    const progressionGraph: ProgressionGraph = {
      version: '0.1.0',
      seed: 7,
      startNodeId: 'room_000',
      endNodeId: 'room_002',
      nodes: [],
      edges: [],
      abilities: ['dash'],
      criticalPath: roomIds,
    };
    const result = new UnityProjectAssembler().assemble({
      outputDir,
      gameDna: dna,
      worldGraph,
      progressionGraph,
      roomIds,
    });
    expect(result.success).toBe(true);
    const pack = JSON.parse(readFileSync(join(outputDir, 'gameplay.json'), 'utf-8')) as {
      rooms: Array<{
        abilityPickup?: { id: string };
        enemy?: { id: string };
        gates: unknown[];
        solids: unknown[];
      }>;
    };
    expect(pack.rooms.length).toBe(3);
    expect(pack.rooms[0]?.abilityPickup?.id).toBe('dash');
    expect(pack.rooms.some((r) => r.gates.length > 0)).toBe(true);
    expect(pack.rooms.some((r) => r.enemy?.id)).toBe(true);
    expect(pack.rooms[0]?.solids.length).toBeGreaterThan(0);
    expect(readFileSync(join(outputDir, 'ProjectSettings/ProjectVersion.txt'), 'utf-8')).toContain('6000.3');
    expect(readFileSync(join(outputDir, 'Assets/Editor/MetroForgeAcceptance.cs'), 'utf-8')).toContain('RunHitchProbe');
    expect(readFileSync(join(outputDir, 'Assets/Editor/MetroForgeAcceptance.cs'), 'utf-8')).toContain('RunCombatStallProbe');
    expect(readFileSync(join(outputDir, 'Assets/Scripts/CombatStallDriver.cs'), 'utf-8')).toContain('cold_production_cam');
    expect(readFileSync(join(outputDir, 'Assets/Scripts/MainThreadProbe.cs'), 'utf-8')).toContain('Foundry.LoadRoom');
    expect(readFileSync(join(outputDir, 'Assets/Scripts/GameBootstrap.cs'), 'utf-8')).toContain('room_load_reentrant');
    expect(readFileSync(join(outputDir, 'Assets/Editor/MetroForgeAcceptance.cs'), 'utf-8')).toContain('RunRoomTransitionProbe');
    expect(readFileSync(join(outputDir, 'Assets/Scripts/RoomTransitionDriver.cs'), 'utf-8')).toContain('cold_entry');
    expect(readFileSync(join(outputDir, 'Assets/Scripts/GameBootstrap.cs'), 'utf-8')).toContain('LastTransitionCached');
    expect(readFileSync(join(outputDir, 'Assets/Scripts/AmbientLoop.cs'), 'utf-8')).toContain('AuthoredRoomId');
    expect(readFileSync(join(outputDir, 'Assets/Scripts/PlayerActor.cs'), 'utf-8')).toContain('Attack hitboxes are child colliders');
    expect(readFileSync(join(outputDir, 'Assets/Scripts/MotionCaptureDriver.cs'), 'utf-8')).toContain('WaitUntilSettled');
    expect(readFileSync(join(outputDir, 'Assets/Scripts/AmbientLoop.cs'), 'utf-8')).toContain('SteamPlume');
    expect(readFileSync(join(outputDir, 'Assets/Scripts/StreamingArtCache.cs'), 'utf-8')).toContain('PreloadTree');
    expect(readFileSync(join(outputDir, 'Assets/Scripts/PlayerActor.cs'), 'utf-8')).toContain('_hitThisSwing');
    expect(readFileSync(join(outputDir, 'Assets/Scripts/AcceptanceDriver.cs'), 'utf-8')).toContain('lastProgressAt');
    expect(readFileSync(join(outputDir, 'Assets/Scripts/GameBootstrap.cs'), 'utf-8')).toContain('SpriteDrawMode.Tiled');
    expect(readFileSync(join(outputDir, 'Assets/Scripts/GameBootstrap.cs'), 'utf-8')).toContain('PlayfieldScrim');
    expect(readFileSync(join(outputDir, 'Assets/Scripts/GameBootstrap.cs'), 'utf-8')).toContain('ReturnToTitle');
    expect(readFileSync(join(outputDir, 'Assets/Scripts/MotionCaptureDriver.cs'), 'utf-8')).toContain('FOUNDRY_MOTION_OK');
    expect(readFileSync(join(outputDir, 'Assets/Scripts/PlayerActor.cs'), 'utf-8')).toContain('_hitThisSwing');
    expect(readFileSync(join(outputDir, 'Assets/Scripts/AcceptanceDriver.cs'), 'utf-8')).toContain('lastProgressAt');
    expect(readFileSync(join(outputDir, 'Assets/Scripts/MotionCaptureDriver.cs'), 'utf-8')).toContain('MotionCaptureDriver');
    expect(readFileSync(join(outputDir, 'engine.json'), 'utf-8')).toContain('"engine": "unity"');
    rmSync(join(outputDir, 'project.godot'), { force: true });
    expect(() => readFileSync(join(outputDir, 'project.godot'))).toThrow();
    rmSync(outputDir, { recursive: true, force: true });
  });
});
