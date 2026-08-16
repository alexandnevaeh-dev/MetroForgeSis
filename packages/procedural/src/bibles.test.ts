import { describe, it, expect } from 'vitest';
import { generateDesignBible, generateStyleBible, applyStyleBiblePrompt } from '../src/bibles.js';
import type { GameDNA } from '@metroforge/schemas';

const dna: GameDNA = {
  version: '0.1.0',
  archetype: 'SIDE_VIEW_METROIDVANIA',
  identity: {
    title: 'Test',
    genre: 'Metroidvania',
    tone: 'dark',
    visualStyle: 'dark mechanical ruins',
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
  world: { biomeCount: 2, roomCount: 8 },
  narrative: {
    premise: 'Test',
    protagonist: 'Knight',
    centralConflict: 'Restore core',
  },
  audio: { musicStyle: 'industrial ambient' },
  seed: 42,
  profile: 'TINY_TEST',
};

describe('generateDesignBible', () => {
  it('derives art and audio bibles from game DNA', () => {
    const bible = generateDesignBible(dna, 'TINY_TEST', 99);
    expect(bible.art.visualStyle).toBe(dna.identity.visualStyle);
    expect(bible.art.palette.length).toBeGreaterThan(0);
    expect(bible.audio.biomeThemes).toHaveLength(1);
    expect(bible.audio.musicStyle).toContain('industrial');
  });

  it('is deterministic for same seed', () => {
    const a = generateDesignBible(dna, 'SMALL', 7);
    const b = generateDesignBible(dna, 'SMALL', 7);
    expect(a.audio.moodKeywords).toEqual(b.audio.moodKeywords);
  });

  it('derives a StyleBible consumed by asset prompts', () => {
    const bible = generateDesignBible(dna, 'RELEASE_CANDIDATE', 184729);
    const style = generateStyleBible(dna, bible.art);
    expect(style.renderingStyle).toBe(dna.identity.visualStyle);
    expect(style.palette.length).toBeGreaterThan(0);
    expect(style.pixelResolution).toBe(16);
    expect(style.nearestNeighbor).toBe(true);
    expect(style.tileSize).toBe(16);
    const prompt = applyStyleBiblePrompt(style, 'CHARACTER', 'relic hunter');
    expect(prompt.toLowerCase()).toContain('pixel');
    expect(prompt).toContain('relic hunter');
  });
});
