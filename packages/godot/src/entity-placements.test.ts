import { describe, expect, it } from 'vitest';
import {
  defaultEntityPlacements,
  resolveEntityPlacements,
  mergeEntityPlacementsForIds,
  findPlacement,
} from './entity-placements.js';
import { generateRoomScene } from './room-assembler.js';

describe('entity placements', () => {
  it('defaults match legacy assembler coordinates', () => {
    const placements = defaultEntityPlacements({
      width: 800,
      height: 600,
      tileSize: 16,
      hasEnemy: true,
      enemyIndex: 0,
      hasSavePoint: true,
      npcs: [{ id: 'npc_000' }],
      abilityPickups: ['dash'],
    });
    expect(findPlacement(placements, 'player_spawn')?.x).toBe(100);
    expect(findPlacement(placements, 'enemy', 'enemy_000')?.x).toBe(650);
    expect(findPlacement(placements, 'checkpoint')?.x).toBe(150);
    expect(findPlacement(placements, 'ability_pickup', 'dash')?.x).toBe(220);
    expect(findPlacement(placements, 'npc', 'npc_000')?.x).toBe(800 * 0.75);
  });

  it('resolveEntityPlacements keeps authored coords and falls back when empty', () => {
    const authored = [{ kind: 'enemy', id: 'enemy_000', x: 333, y: 444 }];
    const resolved = resolveEntityPlacements(authored, {
      width: 800,
      height: 600,
      hasEnemy: true,
      enemyIndex: 0,
    });
    expect(resolved).toEqual([{ kind: 'enemy', id: 'enemy_000', x: 333, y: 444 }]);
    const fallback = resolveEntityPlacements([], { width: 800, height: 600, hasEnemy: true, enemyIndex: 1 });
    expect(fallback.some((p) => p.kind === 'player_spawn')).toBe(true);
    expect(findPlacement(fallback, 'enemy')?.id).toBe('enemy_001');
  });

  it('merge keeps surviving enemy positions when ids change', () => {
    const merged = mergeEntityPlacementsForIds(
      [
        { kind: 'player_spawn', id: 'player', x: 100, y: 500 },
        { kind: 'enemy', id: 'enemy_000', x: 400, y: 500 },
      ],
      { width: 800, height: 600, hasEnemy: true },
      ['enemy_000', 'enemy_001'],
      [],
    );
    expect(findPlacement(merged, 'enemy', 'enemy_000')?.x).toBe(400);
    expect(findPlacement(merged, 'enemy', 'enemy_001')).toBeTruthy();
  });

  it('generateRoomScene writes authored entity positions into the tscn', () => {
    const scene = generateRoomScene('room_000', 0, {
      hasEnemy: true,
      enemyIndex: 0,
      hasAbilityPickup: false,
      abilityPickups: [],
      isBossRoom: false,
      bossId: 'boss_final',
      hasSavePoint: false,
      width: 800,
      height: 600,
      biomeIndex: 0,
      connections: [],
      hasTileset: true,
      tileSize: 16,
      npcs: [],
      hasItemPickup: false,
      itemId: '',
      itemAmount: 1,
      entityPlacements: [
        { kind: 'player_spawn', id: 'player', x: 120, y: 480 },
        { kind: 'enemy', id: 'enemy_000', x: 501, y: 480 },
      ],
    });
    expect(scene).toContain('position = Vector2(120, 480)');
    expect(scene).toContain('position = Vector2(501, 480)');
  });
});
