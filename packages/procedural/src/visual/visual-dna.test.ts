import { describe, expect, it } from 'vitest';
import type { GameDNA } from '@metroforge/schemas';
import {
  generateArtBible,
  generateStyleBible,
  generateVisualDNA,
  generateAllBiomeVisualDNA,
  compileVisualPrompt,
  generateEnvironmentKit,
  generateRoomStorytelling,
  fingerprintFromVisualDNA,
} from '../index.js';

const dna: GameDNA = {
  version: '0.1.0',
  archetype: 'SIDE_VIEW_METROIDVANIA',
  identity: {
    title: 'Tideglass',
    genre: 'Metroidvania',
    tone: 'dark',
    visualStyle: 'drowned gothic citadel',
  },
  technical: {
    resolution: { width: 1920, height: 1080 },
    tileSize: 32,
    targetPlaytimeHours: 1,
    difficulty: 'normal',
  },
  combat: { style: 'melee', meleeEnabled: true, rangedEnabled: false },
  movement: { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 },
  abilities: [{ id: 'dash', name: 'Dash', category: 'movement', enabled: true }],
  world: { biomeCount: 1, roomCount: 10 },
  narrative: {
    premise: 'A collapsed mining colony haunted by a swarm intelligence',
    protagonist: 'tide warden',
    centralConflict: 'seal the swarm',
  },
  seed: 42,
  profile: 'VISUAL_VERTICAL_SLICE',
};

describe('VisualDNA', () => {
  it('is data-driven from GameDNA and remains deterministic', () => {
    const art = generateArtBible(dna, 42);
    const style = generateStyleBible(dna, art);
    const a = generateVisualDNA({ gameDna: dna, artBible: art, styleBible: style });
    const b = generateVisualDNA({ gameDna: dna, artBible: art, styleBible: style });
    expect(a.styleFingerprint).toBe(b.styleFingerprint);
    expect(a.styleFingerprint).toBe(fingerprintFromVisualDNA(a));
    expect(a.palette.global.length).toBeGreaterThan(0);
    expect(a.backgrounds.motion.far).toBeLessThan(a.backgrounds.motion.mid);
    expect(a.backgrounds.motion.mid).toBeLessThan(a.backgrounds.motion.near);
    expect(a.artStyle.id).toBe('gothic-ruin');
  });

  it('derives biome DNA and a production-scale environment kit', () => {
    const art = generateArtBible(dna, 42);
    const style = generateStyleBible(dna, art);
    const visual = generateVisualDNA({ gameDna: dna, artBible: art, styleBible: style });
    const biomes = generateAllBiomeVisualDNA({ visualDNA: visual, gameDna: dna });
    expect(biomes).toHaveLength(1);
    expect(biomes[0]!.parentFingerprint).toBe(visual.styleFingerprint);
    const kit = generateEnvironmentKit({
      visualDNA: visual,
      biome: biomes[0]!,
      profile: 'VISUAL_VERTICAL_SLICE',
      seed: 42,
    });
    expect(kit.terrain.length).toBeGreaterThanOrEqual(3);
    expect(kit.architecture.length).toBeGreaterThanOrEqual(8);
    expect(kit.props.length).toBeGreaterThanOrEqual(12);
    expect(kit.decorations.length).toBeGreaterThanOrEqual(8);
    const story = generateRoomStorytelling({
      roomId: 'room_000',
      biome: biomes[0]!,
      visualDNA: visual,
      archetype: 'boss',
      seed: 42,
      index: 9,
      kitPropIds: kit.props.map((p) => p.id),
    });
    expect(story.placements.length).toBeGreaterThan(0);
    expect(story.archetype).toBe('boss');
  });

  it('compiles a stable visual prompt with hashes', () => {
    const art = generateArtBible(dna, 42);
    const style = generateStyleBible(dna, art);
    const visual = generateVisualDNA({ gameDna: dna, artBible: art, styleBible: style });
    const compiled = compileVisualPrompt({
      visualDNA: visual,
      category: 'player',
      subject: 'tide warden with a glass-edged blade',
      role: 'player',
      technicalSpec: { width: 64, height: 64, transparentBackground: true, tileSize: 32 },
      variantSeed: 42,
    });
    expect(compiled.compiler).toBe('VisualPromptCompiler');
    expect(compiled.promptHash).toHaveLength(16);
    expect(compiled.prompt).toContain('tide warden');
    expect(compiled.negativePrompt.length).toBeGreaterThan(10);
    expect(compiled.styleFingerprint).toBe(visual.styleFingerprint);
    const again = compileVisualPrompt({
      visualDNA: visual,
      category: 'player',
      subject: 'tide warden with a glass-edged blade',
      role: 'player',
      technicalSpec: { width: 64, height: 64, transparentBackground: true, tileSize: 32 },
      variantSeed: 42,
    });
    expect(again.promptHash).toBe(compiled.promptHash);
  });
});
