import { describe, it, expect } from 'vitest';
import { GameDNASchema, ProjectSchema } from '../src/core.js';

describe('GameDNASchema', () => {
  it('validates minimal game DNA', () => {
    const dna = {
      version: '0.1.0',
      identity: {
        title: 'Test Game',
        genre: 'Metroidvania',
        tone: 'dark',
        visualStyle: 'HD pixel art',
      },
      technical: {
        resolution: { width: 1920, height: 1080 },
        tileSize: 16,
        targetPlaytimeHours: 4,
        difficulty: 'normal' as const,
      },
      combat: { style: 'fast melee', meleeEnabled: true, rangedEnabled: false },
      movement: { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 },
      abilities: [{ id: 'dash', name: 'Dash', category: 'movement', enabled: true }],
      world: { biomeCount: 1, roomCount: 8 },
      narrative: {
        premise: 'A forgotten machine civilization',
        protagonist: 'The Wanderer',
        centralConflict: 'Restore the core',
      },
      seed: 42,
      profile: 'TINY_TEST' as const,
    };
    expect(GameDNASchema.parse(dna)).toEqual(dna);
  });
});

describe('ProjectSchema', () => {
  it('validates project', () => {
    const now = new Date().toISOString();
    const project = {
      id: 'proj_1',
      slug: 'test-game',
      title: 'Test Game',
      description: 'A test',
      profile: 'TINY_TEST' as const,
      mode: 'LOCAL_ONLY' as const,
      seed: 1,
      outputPath: 'GeneratedGames/test-game',
      createdAt: now,
      updatedAt: now,
      status: 'draft' as const,
    };
    expect(ProjectSchema.parse(project)).toEqual(project);
  });
});
