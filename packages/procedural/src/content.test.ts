import { describe, it, expect } from 'vitest';
import { generateGameContent } from '../src/content.js';
import { GameDNASchema } from '@metroforge/schemas';

const testDna = GameDNASchema.parse({
  version: '0.1.0',
  identity: {
    title: 'Test Game',
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
  combat: { style: 'melee', meleeEnabled: true, rangedEnabled: false },
  movement: { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 },
  abilities: [{ id: 'dash', name: 'Dash', category: 'movement', enabled: true }],
  world: { biomeCount: 1, roomCount: 8 },
  narrative: {
    premise: 'Test',
    protagonist: 'Hero',
    centralConflict: 'Conflict',
  },
  seed: 42,
  profile: 'TINY_TEST',
});

describe('generateGameContent', () => {
  it('generates tiny test content counts', () => {
    const content = generateGameContent(testDna, 'TINY_TEST', 42, 'room_007');
    expect(content.enemies).toHaveLength(2);
    expect(content.bosses).toHaveLength(1);
    expect(content.quests).toHaveLength(1);
    expect(content.items.length).toBeGreaterThanOrEqual(2);
  });

  it('final boss has boss_final id', () => {
    const content = generateGameContent(testDna, 'TINY_TEST', 42, 'room_007');
    expect(content.bosses[0]?.id).toBe('boss_final');
  });
});
