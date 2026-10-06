import { describe, expect, it } from 'vitest';
import { engineOutputSlug, parseTargetEngine } from './engines.js';

describe('engine selection', () => {
  it('defaults to godot and rejects unknown engines', () => {
    expect(parseTargetEngine(undefined)).toBe('godot');
    expect(parseTargetEngine('UNITY')).toBe('unity');
    const bad = parseTargetEngine('source');
    expect(typeof bad).toBe('object');
    if (typeof bad === 'object') {
      expect(bad.error).toContain('godot, unity, unreal');
    }
  });

  it('isolates Unity and Unreal slugs without renaming Godot', () => {
    expect(engineOutputSlug('foundry-world', 'godot')).toBe('foundry-world');
    expect(engineOutputSlug('foundry-world', 'unity')).toBe('foundry-world-unity');
    expect(engineOutputSlug('foundry-world-unity', 'unity')).toBe('foundry-world-unity');
    expect(engineOutputSlug('foundry-world', 'unreal')).toBe('foundry-world-unreal');
  });
});
