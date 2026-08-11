import { describe, it, expect } from 'vitest';
import { synthesizeSfx, DEFAULT_SFX } from '../src/audio.js';

describe('synthesizeSfx', () => {
  it('generates valid WAV buffer', () => {
    const buffer = synthesizeSfx(DEFAULT_SFX[0]!);
    expect(buffer.length).toBeGreaterThan(44);
    expect(buffer.toString('ascii', 0, 4)).toBe('RIFF');
    expect(buffer.toString('ascii', 8, 12)).toBe('WAVE');
  });

  it('generates different sizes for different durations', () => {
    const short = synthesizeSfx({ id: 'a', frequency: 440, duration: 0.05, type: 'sine' });
    const long = synthesizeSfx({ id: 'b', frequency: 440, duration: 0.2, type: 'sine' });
    expect(long.length).toBeGreaterThan(short.length);
  });
});
