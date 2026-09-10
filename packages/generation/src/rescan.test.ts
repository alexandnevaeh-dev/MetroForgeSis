import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rescoreVisualSlice } from './rescan.js';

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function seedProject(dir: string): void {
  writeJson(join(dir, 'game_dna.json'), {
    profile: 'RELEASE_CANDIDATE',
    archetype: 'SIDE_VIEW_METROIDVANIA',
    world: { roomCount: 3, biomeCount: 1 },
  });
  writeJson(join(dir, 'project.json'), {
    slug: 'test-slice',
    seed: 42,
    profile: 'VISUAL_VERTICAL_SLICE',
    archetype: 'SIDE_VIEW_METROIDVANIA',
  });
  writeJson(join(dir, 'visual_dna.json'), {
    styleFingerprint: 'abc123',
    artStyle: { id: 'test', label: 'test style', renderingFamily: 'test', edgeTreatment: '', shadingSteps: 1, textureDensity: 'low' },
    renderingStyle: 'pixel art',
    palette: { global: [], shadows: [], highlights: [], accents: [], ui: [] },
    lighting: {},
  });
  writeJson(join(dir, 'style_bible.json'), { artStyle: 'pixel', tileSize: 16 });
  writeJson(join(dir, 'character_visual_dna.json'), { silhouette: 'lean', weapon: 'sword', anchor: 'feet' });
  mkdirSync(join(dir, 'reports'), { recursive: true });
  writeJson(join(dir, 'reports', 'VGF2_VISUAL_VERTICAL_SLICE.json'), {
    maturity: { production: 10, placeholder: 1, rejected: 0, unknownLicense: 0 },
    scores: { overall: 50, overallConfidence: 40 },
    verdict: 'AUTOMATED_VISUAL_FAIL',
  });
}

function staticGates() {
  return [
    { gate: 'required_files', passed: true, message: '', state: 'PASS' as const },
    { gate: 'game_dna_valid', passed: true, message: '', state: 'PASS' as const },
  ];
}

describe('rescoreVisualSlice', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'metroforge-rescan-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuses to run without a validation_report.json', () => {
    seedProject(dir);
    const result = rescoreVisualSlice(dir);
    expect(result.ran).toBe(false);
    expect(result.reason).toMatch(/validation_report/);
  });

  it('refuses to run for a project not generated with the VISUAL_VERTICAL_SLICE profile', () => {
    seedProject(dir);
    writeJson(join(dir, 'project.json'), { slug: 'test', seed: 1, profile: 'RELEASE_CANDIDATE' });
    writeJson(join(dir, 'validation_report.json'), {
      validationLevel: 'RUNTIME_VALIDATED',
      results: [...staticGates(), { gate: 'godot_imports', passed: true, state: 'PASS', message: '' }],
    });
    const result = rescoreVisualSlice(dir);
    expect(result.ran).toBe(false);
    expect(result.reason).toMatch(/VISUAL_VERTICAL_SLICE/);
  });

  it('recomputes functionalQuality=90 and flips a stale AUTOMATED_VISUAL_FAIL once real runtime validation passed', () => {
    seedProject(dir);
    // scoreVisualQuality hard-fails on missing terrain/UI textures and an invisible player
    // regardless of functionalQuality — seed the minimal asset files a real generated
    // project would already have so this test isolates the functionalQuality/critic-score effect.
    mkdirSync(join(dir, 'assets', 'characters'), { recursive: true });
    mkdirSync(join(dir, 'assets', 'tilesets', 'biome_0'), { recursive: true });
    mkdirSync(join(dir, 'assets', 'ui'), { recursive: true });
    mkdirSync(join(dir, 'assets', 'backgrounds', 'biome_0'), { recursive: true });
    writeFileSync(join(dir, 'assets', 'characters', 'player.png'), Buffer.from([0]));
    writeFileSync(join(dir, 'assets', 'tilesets', 'biome_0', 'source.png'), Buffer.from([0]));
    writeFileSync(join(dir, 'assets', 'ui', 'hud_frame.png'), Buffer.from([0]));
    writeFileSync(join(dir, 'assets', 'backgrounds', 'biome_0', 'far.png'), Buffer.from([1]));
    writeFileSync(join(dir, 'assets', 'backgrounds', 'biome_0', 'mid.png'), Buffer.from([2]));
    writeFileSync(join(dir, 'assets', 'backgrounds', 'biome_0', 'near.png'), Buffer.from([3]));
    writeJson(join(dir, 'validation_report.json'), {
      validationLevel: 'RUNTIME_VALIDATED',
      results: [
        ...staticGates(),
        { gate: 'godot_imports', passed: true, state: 'PASS', message: '' },
        { gate: 'godot_runtime', passed: true, state: 'SOFT_FAIL', message: '' },
      ],
    });

    const result = rescoreVisualSlice(dir);

    // No qa/screenshot_gameplay.png exists in this fixture, so the critic score still falls
    // back to its neutral default (real behavior — see scoreVisualQuality) and caps `overall`;
    // what this test isolates is that functionalQuality/overallConfidence now reflect the real
    // RUNTIME_VALIDATED result instead of the stale skip-runtime-validation value of 40.
    expect(result.ran).toBe(true);
    expect(result.validationLevel).toBe('RUNTIME_VALIDATED');
    expect(result.functionalQuality).toBe(90);
    expect(result.before?.verdict).toBe('AUTOMATED_VISUAL_FAIL');
    expect(result.after!.overallConfidence).toBeGreaterThan(result.before!.overallConfidence);

    const persisted = JSON.parse(readFileSync(join(dir, 'reports', 'VGF2_VISUAL_VERTICAL_SLICE.json'), 'utf-8'));
    expect(persisted.scores.functionalQuality).toBe(90);
    expect(persisted.verdict).toBe(result.after?.verdict);
  });

  it('keeps functionalQuality=40 when the runtime gate actually failed', () => {
    seedProject(dir);
    writeJson(join(dir, 'validation_report.json'), {
      validationLevel: 'FAILED',
      results: [
        ...staticGates(),
        { gate: 'godot_imports', passed: true, state: 'PASS', message: '' },
        { gate: 'godot_runtime', passed: false, state: 'FAIL', message: 'runtime crash' },
      ],
    });

    const result = rescoreVisualSlice(dir);

    expect(result.ran).toBe(true);
    expect(result.validationLevel).toBe('FAILED');
    expect(result.functionalQuality).toBe(40);
  });
});
