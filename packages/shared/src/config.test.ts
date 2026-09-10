import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('Godot configuration compatibility', () => {
  it('prefers GODOT_EXECUTABLE and supports legacy Godot variables', () => {
    expect(loadConfig({ GODOT_EXECUTABLE: '/preferred', GODOT4_PATH: '/godot4' }).godotExecutable)
      .toBe('/preferred');
    expect(loadConfig({ GODOT4_PATH: '/godot4' }).godotExecutable).toBe('/godot4');
    expect(loadConfig({ GODOT_PATH: '/godot' }).godotExecutable).toBe('/godot');
  });
});
