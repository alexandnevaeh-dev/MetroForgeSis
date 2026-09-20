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

describe('Unity and Unreal configuration', () => {
  it('reads UNITY_EDITOR and UE_ROOT without colliding with Godot', () => {
    const cfg = loadConfig({
      GODOT_EXECUTABLE: '/godot',
      UNITY_EDITOR: '/unity',
      UE_ROOT: '/unreal',
    });
    expect(cfg.godotExecutable).toBe('/godot');
    expect(cfg.unityEditor).toBe('/unity');
    expect(cfg.unrealEditor).toBe('/unreal');
  });
});
