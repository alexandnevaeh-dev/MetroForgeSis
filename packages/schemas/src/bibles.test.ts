import { describe, it, expect } from 'vitest';
import { ArtBibleSchema, AudioBibleSchema, DesignBibleSchema, StyleBibleSchema } from '../src/bibles.js';

describe('ArtBibleSchema', () => {
  it('validates art bible', () => {
    const art = {
      version: '0.1.0',
      seed: 1,
      visualStyle: 'dark pixel art',
      palette: [{ name: 'Shadow', hex: '#141820', usage: 'backgrounds' }],
      characterGuidelines: {
        player: 'hero',
        enemy: 'hostile',
        boss: 'boss',
        npc: 'friendly',
      },
      environmentGuidelines: {
        tileStyle: '16px tiles',
        lighting: 'low key',
        parallax: '2 layers',
      },
      uiGuidelines: {
        fontStyle: 'pixel',
        hudTheme: 'minimal',
        iconStyle: '16px',
      },
      negativePrompts: ['blurry'],
      promptPrefixes: { CHARACTER: 'pixel art character,' },
    };
    expect(ArtBibleSchema.parse(art)).toEqual(art);
  });
});

describe('DesignBibleSchema', () => {
  it('validates nested design bible', () => {
    const bible = {
      version: '0.1.0',
      seed: 1,
      art: {
        version: '0.1.0',
        seed: 1,
        visualStyle: 'dark pixel art',
        palette: [{ name: 'Shadow', hex: '#141820', usage: 'backgrounds' }],
        characterGuidelines: {
          player: 'hero',
          enemy: 'hostile',
          boss: 'boss',
          npc: 'friendly',
        },
        environmentGuidelines: {
          tileStyle: '16px tiles',
          lighting: 'low key',
          parallax: '2 layers',
        },
        uiGuidelines: {
          fontStyle: 'pixel',
          hudTheme: 'minimal',
          iconStyle: '16px',
        },
        negativePrompts: ['blurry'],
        promptPrefixes: { CHARACTER: 'pixel art character,' },
      },
      audio: {
        version: '0.1.0',
        seed: 2,
        musicStyle: 'ambient',
        moodKeywords: ['mysterious'],
        instrumentation: ['synth pad'],
        biomeThemes: [{ biomeId: 'biome_0', mood: 'tense', tempo: 'slow', key: 'Am' }],
        sfxGuidelines: {
          combat: 'short',
          movement: 'light',
          ui: 'soft',
          ambient: 'room tone',
        },
        mixNotes: 'duck music under sfx',
      },
    };
    expect(DesignBibleSchema.parse(bible)).toEqual(bible);
    expect(AudioBibleSchema.parse(bible.audio)).toEqual(bible.audio);
  });
});

describe('StyleBibleSchema', () => {
  it('validates a persisted style bible', () => {
    const style = {
      styleId: 'dark-pixel-art',
      renderingStyle: 'dark pixel art',
      pixelResolution: 16,
      palette: [{ name: 'Shadow', hex: '#141820', usage: 'backgrounds' }],
      outlineRules: '16px',
      lighting: 'low key',
      materials: '16px tiles',
      characterScale: '16px-grid readable silhouette',
      spritePerspective: 'side view',
      environmentDensity: '2 layers',
      VFXStyle: 'pixel sparks',
      UIStyle: 'minimal',
      promptPrefixes: { CHARACTER: 'pixel art character,' },
      negativePrompts: ['blurry'],
    };
    expect(StyleBibleSchema.parse(style)).toEqual(style);
  });
});
