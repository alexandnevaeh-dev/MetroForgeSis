import { describe, it, expect } from 'vitest';
import { generateMusicFromAudioBible, generateTrackerPattern } from '../src/music.js';
import type { AudioBible } from '@metroforge/schemas';

const audioBible: AudioBible = {
  version: '0.1.0',
  seed: 1,
  musicStyle: 'dark ambient',
  moodKeywords: ['mysterious', 'tense'],
  instrumentation: ['synth pad', 'bass pulse'],
  biomeThemes: [
    { biomeId: 'biome_0', mood: 'mysterious', tempo: 'slow', key: 'Am' },
    { biomeId: 'biome_1', mood: 'tense', tempo: 'medium', key: 'Dm' },
  ],
  sfxGuidelines: {
    combat: 'short',
    movement: 'light',
    ui: 'soft',
    ambient: 'room tone',
  },
  mixNotes: 'duck music under sfx',
};

describe('generateMusicFromAudioBible', () => {
  it('generates biome loops, MIDI, and Furnace modules', () => {
    const result = generateMusicFromAudioBible(audioBible, 42);
    expect(result.audio.size).toBeGreaterThanOrEqual(4);
    expect(result.audio.has('music_boss')).toBe(true);
    expect(result.patterns.size).toBe(3);
    expect(result.midi.size).toBe(3);
    expect(result.furnace.size).toBe(3);
    expect(result.midi.get('biome_0')![0]).toBe(0x4d); // 'M' from MThd
    expect(result.midi.has('boss')).toBe(true);
  });

  it('tracker pattern is deterministic', () => {
    const a = generateTrackerPattern(audioBible.biomeThemes[0]!, 7);
    const b = generateTrackerPattern(audioBible.biomeThemes[0]!, 7);
    expect(a.events).toEqual(b.events);
  });
});
