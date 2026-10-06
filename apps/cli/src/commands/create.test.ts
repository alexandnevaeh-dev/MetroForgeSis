import { describe, expect, it } from 'vitest';
import { resolveResumeFlag, resolveVisualMode } from './create.js';

describe('resolveResumeFlag (metroforge generate --fresh)', () => {
  it('forces resume off when --fresh is passed, even though --resume defaults to true', () => {
    expect(resolveResumeFlag({ resume: true, fresh: true })).toBe(false);
  });

  it('falls back to --resume when --fresh is not passed', () => {
    expect(resolveResumeFlag({ resume: true, fresh: false })).toBe(true);
    expect(resolveResumeFlag({ resume: true })).toBe(true);
  });

  it('leaves resume undefined when neither flag is set', () => {
    expect(resolveResumeFlag({})).toBeUndefined();
  });
});

describe('parseTargetEngine (metroforge create --engine)', () => {
  it('defaults to godot and accepts unity/unreal', async () => {
    const { parseTargetEngine } = await import('@metroforge/shared');
    expect(parseTargetEngine(undefined)).toBe('godot');
    expect(parseTargetEngine('unity')).toBe('unity');
    expect(parseTargetEngine('unreal')).toBe('unreal');
  });

  it('rejects unknown engines with the valid list', async () => {
    const { parseTargetEngine } = await import('@metroforge/shared');
    const result = parseTargetEngine('source');
    expect(typeof result).toBe('object');
    if (typeof result === 'object') {
      expect(result.error).toContain('godot, unity, unreal');
    }
  });
});

describe('resolveVisualMode (metroforge create --visual-mode)', () => {
  it('defaults to procedural-only when the flag is absent', () => {
    expect(resolveVisualMode(undefined)).toEqual({ visualMode: 'procedural-only' });
  });

  it('accepts all three documented modes', () => {
    expect(resolveVisualMode('procedural-only')).toEqual({ visualMode: 'procedural-only' });
    expect(resolveVisualMode('nvidia-enhanced')).toEqual({ visualMode: 'nvidia-enhanced' });
    expect(resolveVisualMode('auto')).toEqual({ visualMode: 'auto' });
  });

  it('rejects an unknown mode with a message listing the valid options', () => {
    const result = resolveVisualMode('gpt-image');
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('gpt-image');
      expect(result.error).toContain('procedural-only');
      expect(result.error).toContain('nvidia-enhanced');
      expect(result.error).toContain('auto');
    }
  });
});
