import { describe, expect, it } from 'vitest';
import type { GameDNA } from '@metroforge/schemas';
import {
  generateArtBible,
  generateCharacterVisualDNA,
  buildVisualStyleContract,
  generateStyleBible,
  generateVisualDNA,
  generateAllBiomeVisualDNA,
  compileVisualPrompt,
  generateEnvironmentKit,
  generateRoomStorytelling,
  fingerprintFromVisualDNA,
  buildDeterministicBiomeLightingProfile,
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

  it('derives distinct deterministic biome lighting profiles with room variation', () => {
    const art = generateArtBible(dna, 42);
    const style = generateStyleBible(dna, art);
    const visual = generateVisualDNA({ gameDna: dna, artBible: art, styleBible: style });
    const biomes = generateAllBiomeVisualDNA({ visualDNA: visual, gameDna: dna });
    const profiles = biomes.map((biome, index) =>
      buildDeterministicBiomeLightingProfile({ biome, seed: 184729, roomId: `room_${index}` }),
    );

    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      ambientColor: expect.any(String),
      keyLightColor: expect.any(String),
      accentLightColor: expect.any(String),
      fogColor: expect.any(String),
    });
    expect(profiles[0].ambientIntensity).toBeGreaterThan(0);
    expect(profiles[0].fogStrength).toBeGreaterThan(0.05);
    expect(profiles[0].emissiveAccent).toMatch(/^#/);
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

  it('matches mechanical-forge from a Foundry prompt even when visualStyle is HD pixel art', () => {
    const foundryDna: GameDNA = {
      ...dna,
      identity: {
        title: 'A courier in a furnace foundry, orange claw enemy, 32px indu',
        tagline: 'A courier in a furnace foundry, orange claw enemy, 32px industrial kit, side-view metroidvania',
        genre: 'Metroidvania',
        tone: 'dark',
        visualStyle: 'HD pixel art',
      },
      narrative: {
        premise: 'A courier in a furnace foundry, orange claw enemy, 32px industrial kit, side-view metroidvania',
        protagonist: 'The Wanderer',
        centralConflict: 'Restore balance to a fractured world',
      },
    };
    const art = generateArtBible(foundryDna, 20260909);
    const style = generateStyleBible(foundryDna, art);
    const visual = generateVisualDNA({ gameDna: foundryDna, artBible: art, styleBible: style });
    expect(visual.artStyle.id).toBe('mechanical-forge');
    const biomes = generateAllBiomeVisualDNA({ visualDNA: visual, gameDna: foundryDna });
    expect(biomes[0]!.displayName.toLowerCase()).toMatch(/pouring bay|foundry|clockwork|vault/);
    if (biomes.length > 1) expect(biomes[1]!.displayName.toLowerCase()).toMatch(/quench/);
    if (biomes.length > 2) expect(biomes[2]!.displayName.toLowerCase()).toMatch(/cooling/);
    expect(art.palette.some((c) => c.hex === '#101018')).toBe(true);
  });
});


describe('action-pose visual generation contract', () => {
  it('keeps jump frames airborne-compatible and preserves prompt identity and geometry', () => {
    const art = generateArtBible(dna, 42);
    const style = generateStyleBible(dna, art);
    const visual = generateVisualDNA({ gameDna: dna, artBible: art, styleBible: style });
    const input = { visualDNA: visual, category: 'player' as const, subject: 'tide warden',
      technicalSpec: { width: 256, height: 384, transparentBackground: true }, identityReference: 'warden-approved-v1' };
    const idle = compileVisualPrompt({ ...input, animationState: 'idle' });
    const jump = compileVisualPrompt({ ...input, animationState: 'jump' });
    expect(idle.prompt).toContain('balanced stance');
    expect(jump.prompt).not.toContain('feet planted');
    expect(jump.prompt).not.toContain('balanced stance');
    expect(jump.prompt).toContain('articulated shoulders elbows hips knees and head');
    expect(jump.prompt).toContain('warden-approved-v1');
    expect(jump.technicalConstraints).toMatchObject({ width: 256, height: 384, transparentBackground: true });
    expect(jump.promptHash).not.toBe(idle.promptHash);
    expect(jump.compilerVersion).toBe(2);
  });
});


describe('painted medium across generation stages', () => {
  it('preserves explicit painted gothic art from bible through final prompts', () => {
    const paintedDna = { ...dna, identity: { ...dna.identity, visualStyle: 'hand-painted gothic abbey' } };
    const art = generateArtBible(paintedDna, 42);
    const style = generateStyleBible(paintedDna, art);
    const character = generateCharacterVisualDNA(paintedDna, art);
    const visual = generateVisualDNA({ gameDna: paintedDna, artBible: art, styleBible: style });
    const prompt = compileVisualPrompt({ visualDNA: visual, category: 'player', subject: 'abbey warden', animationState: 'run',
      technicalSpec: { width: 256, height: 384, transparentBackground: true } });
    const combined = [Object.values(art.promptPrefixes).join(' '), style.outlineRules, style.shadingRules,
      character.lighting, character.bodyProportions, visual.artStyle.label, visual.characters.outline,
      buildVisualStyleContract(style).promptFragment, prompt.prompt].join(' ');
    expect(combined).not.toMatch(/pixel art|1px|pixel density|no painterly/i);
    expect(visual.artStyle.renderingFamily).toBe('hand-painted');
    expect(style).toMatchObject({ pixelFiltering: 'linear', nearestNeighbor: false, pixelSnap: false });
    expect(prompt.technicalConstraints.pixelArt).toBe(false);
    expect(prompt.prompt).toContain('stronger arm drive');
  });
  it('retains legacy pixel settings for explicitly pixel artwork', () => {
    const pixelDna = { ...dna, identity: { ...dna.identity, visualStyle: 'gothic pixel art' } };
    const art = generateArtBible(pixelDna, 42);
    const style = generateStyleBible(pixelDna, art);
    const visual = generateVisualDNA({ gameDna: pixelDna, artBible: art, styleBible: style });
    expect(art.promptPrefixes.CHARACTER).toContain('pixel art');
    expect(style).toMatchObject({ pixelFiltering: 'nearest', nearestNeighbor: true, pixelSnap: true });
    expect(visual.artStyle.id).toBe('gothic-ruin');
  });
});
